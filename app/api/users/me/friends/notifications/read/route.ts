import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { markVisibleFriendNotificationsRead } from "@/lib/friends";
import { rateLimitResponse } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { ok: false, message: "Entre para ver sua rede." },
      { status: 401 },
    );
  }

  const limited = rateLimitResponse({
    body: {
      ok: false,
      message: "Muitas atualizações em pouco tempo. Aguarde um instante.",
    },
    identity: session.user.id,
    limit: 30,
    namespace: "friends-notifications-read",
    request,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  try {
    return Response.json({
      ok: true,
      dashboard: await markVisibleFriendNotificationsRead(session.user.id),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para atualizar notificações.");
  }
}
