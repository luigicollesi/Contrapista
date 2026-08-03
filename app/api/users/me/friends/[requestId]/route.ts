import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import {
  cancelFriendRequest,
  removeFriend,
  respondToFriendRequest,
  touchUserPresence,
} from "@/lib/friends";
import { rateLimitResponse } from "@/lib/security/rate-limit";

function unauthorized() {
  return Response.json(
    { ok: false, message: "Entre para cuidar da sua rede." },
    { status: 401 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 30,
    namespace: "friends-respond",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const { requestId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
  };
  const action = body.action === "accept" ? "accept" : "decline";

  try {
    await touchUserPresence(session.user.id);

    return Response.json({
      ok: true,
      dashboard: await respondToFriendRequest({
        action,
        requestId,
        userId: session.user.id,
      }),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para responder ao pedido.");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 30,
    namespace: "friends-delete",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const { requestId } = await params;
  const url = new URL(request.url);
  const friendUserId = url.searchParams.get("friendUserId");

  try {
    await touchUserPresence(session.user.id);

    return Response.json({
      ok: true,
      dashboard: friendUserId
        ? await removeFriend({
            friendUserId,
            userId: session.user.id,
          })
        : await cancelFriendRequest({
            requestId,
            userId: session.user.id,
          }),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para atualizar sua rede.");
  }
}
