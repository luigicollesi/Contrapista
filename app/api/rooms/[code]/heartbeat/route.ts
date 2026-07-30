import { errorResponse } from "@/lib/api-response";
import { heartbeatRoomUser } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    userId?: string;
  };

  if (!body.userId) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  try {
    const room = await heartbeatRoomUser({ code, userId: body.userId });

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar presença.");
  }
}
