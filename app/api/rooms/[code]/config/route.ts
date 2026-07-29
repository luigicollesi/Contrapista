import { updateRoomConfig, type RoomConfig } from "@/lib/rooms";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    userId?: string;
    config?: Partial<RoomConfig>;
  };

  if (!body.userId || !body.config) {
    return Response.json({ error: "Configuração inválida." }, { status: 400 });
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
    const message =
      error instanceof Error ? error.message : "Erro ao atualizar configuração.";

    return Response.json({ error: message }, { status: 400 });
  }
}
