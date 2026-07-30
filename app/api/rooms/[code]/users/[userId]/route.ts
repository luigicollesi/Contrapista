import { errorResponse } from "@/lib/api-response";
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
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar usuário.");
  }
}
