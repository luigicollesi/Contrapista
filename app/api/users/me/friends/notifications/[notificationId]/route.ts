import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { deleteFriendNotification, touchUserPresence } from "@/lib/friends";
import { rateLimitResponse } from "@/lib/security/rate-limit";

function unauthorized() {
  return Response.json(
    { ok: false, message: "Entre para atualizar seus avisos." },
    { status: 401 },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 40,
    namespace: "friends-notification-delete",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const { notificationId } = await params;

  try {
    await touchUserPresence(session.user.id);

    return Response.json({
      ok: true,
      dashboard: await deleteFriendNotification({
        notificationId: decodeURIComponent(notificationId),
        userId: session.user.id,
      }),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para remover o aviso.");
  }
}
