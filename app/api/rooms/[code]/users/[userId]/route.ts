import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { updateRoomUser } from "@/lib/rooms";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login para atualizar sua cor." },
      { status: 401 },
    );
  }

  const { code, userId } = await params;
  const body = (await request.json()) as {
    color?: string;
  };

  try {
    const result = await updateRoomUser({
      code,
      userId,
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
