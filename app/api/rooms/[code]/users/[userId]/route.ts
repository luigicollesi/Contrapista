import { updateRoomUser } from "@/lib/rooms";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> },
) {
  const { code, userId } = await params;
  const body = (await request.json()) as {
    nickname?: string;
    color?: string;
  };

  try {
    const result = await updateRoomUser({
      code,
      userId,
      nickname: body.nickname ?? "",
      color: body.color ?? "",
    });

    if (!result) {
      return Response.json({ error: "Sala nao encontrada." }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao atualizar usuario.";

    return Response.json({ error: message }, { status: 400 });
  }
}
