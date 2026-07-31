import { errorResponse } from "@/lib/api-response";
import { leaveRoom } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
  };

  if (!body.userId) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "room-leave",
    code,
    userId: body.userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const room = await leaveRoom({ code, userId: body.userId });

    if (!room) {
      return Response.json({ room: null, deleted: true });
    }

    return Response.json({ room });
  } catch (error) {
    return errorResponse(error, "Erro ao sair da sala.");
  }
}
