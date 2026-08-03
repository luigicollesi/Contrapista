import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import {
  getFriendsDashboard,
  getUnreadNotificationCount,
  getUnreadNotifications,
  searchFriendCandidates,
  sendFriendRequest,
  touchUserPresence,
} from "@/lib/friends";
import { rateLimitResponse } from "@/lib/security/rate-limit";

function unauthorized() {
  return Response.json(
    { ok: false, message: "Entre para ver sua rede." },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const isSummary = url.searchParams.get("summary") === "1";
  const shouldIncludeNotifications =
    url.searchParams.get("includeNotifications") === "1";

  try {
    if (isSummary) {
      if (shouldIncludeNotifications) {
        const notifications = await getUnreadNotifications(session.user.id);

        return Response.json({
          ok: true,
          notifications,
          unreadNotificationCount: notifications.length,
        });
      }

      return Response.json({
        ok: true,
        unreadNotificationCount: await getUnreadNotificationCount(session.user.id),
      });
    }

    if (query.trim()) {
      const limited = rateLimitResponse({
        body: {
          ok: false,
          message: "Muitas buscas em pouco tempo. Aguarde um instante.",
        },
        identity: session.user.id,
        limit: 30,
        namespace: "friends-search",
        request,
        windowMs: 60_000,
      });

      if (limited) {
        return limited;
      }

      return Response.json({
        ok: true,
        results: await searchFriendCandidates({
          query,
          userId: session.user.id,
        }),
      });
    }

    return Response.json({
      ok: true,
      dashboard: await getFriendsDashboard(session.user.id),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para abrir sua rede.");
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 20,
    namespace: "friends-send",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const body = (await request.json().catch(() => ({}))) as {
    username?: unknown;
  };
  const username = typeof body.username === "string" ? body.username : "";

  try {
    await touchUserPresence(session.user.id);

    return Response.json({
      ok: true,
      dashboard: await sendFriendRequest({
        targetUsername: username,
        userId: session.user.id,
      }),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para enviar o pedido.");
  }
}
