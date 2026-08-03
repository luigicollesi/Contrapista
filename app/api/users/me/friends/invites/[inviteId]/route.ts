import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { respondToRoomInvite, touchUserPresence } from "@/lib/friends";
import { rateLimitResponse } from "@/lib/security/rate-limit";

function unauthorized() {
  return Response.json(
    { ok: false, message: "Entre para responder ao convite." },
    { status: 401 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 40,
    namespace: "friends-room-invite-respond",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const { inviteId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
  };
  const action = body.action === "accept" ? "accept" : "decline";

  try {
    await touchUserPresence(session.user.id);

    return Response.json({
      ok: true,
      dashboard: await respondToRoomInvite({
        action,
        inviteId,
        userId: session.user.id,
      }),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para responder ao convite.");
  }
}
