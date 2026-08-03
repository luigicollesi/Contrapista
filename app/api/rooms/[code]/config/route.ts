import { errorResponse } from "@/lib/api-response";
import { updateRoomConfig, type RoomConfig } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    config?: Partial<RoomConfig>;
  };

  if (!body.userId || !body.config) {
    return Response.json({ error: "Revise os ajustes da mesa." }, { status: 400 });
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "room-config",
    code,
    userId: body.userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const room = await updateRoomConfig({
      code,
      userId: body.userId,
      config: body.config,
    });

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    return errorResponse(error, "Não deu para salvar a mesa.");
  }
}
