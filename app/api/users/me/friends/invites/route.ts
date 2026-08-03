import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { sendRoomInvite, touchUserPresence } from "@/lib/friends";
import { rateLimitResponse } from "@/lib/security/rate-limit";

function unauthorized() {
  return Response.json(
    { ok: false, message: "Entre para convidar amigos." },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 30,
    namespace: "friends-room-invite",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const body = (await request.json().catch(() => ({}))) as {
    friendUserId?: unknown;
    roomCode?: unknown;
  };
  const friendUserId =
    typeof body.friendUserId === "string" ? body.friendUserId : "";
  const roomCode = typeof body.roomCode === "string" ? body.roomCode : "";

  try {
    await touchUserPresence(session.user.id);

    return Response.json({
      ok: true,
      dashboard: await sendRoomInvite({
        friendUserId,
        roomCode,
        userId: session.user.id,
      }),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para enviar o convite.");
  }
}
