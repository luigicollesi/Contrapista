import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { getCase } from "@/lib/cases";
import { getRoom } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login para acessar o caso da partida." },
      { status: 401 },
    );
  }

  const { caseId } = await params;
  const { searchParams } = new URL(request.url);
  const roomCode = searchParams.get("roomCode")?.trim() ?? "";
  const userId = searchParams.get("userId")?.trim() ?? "";

  if (!roomCode || !userId) {
    return Response.json(
      { error: "Sala e usuário são obrigatórios para acessar o caso." },
      { status: 400 },
    );
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "case-read",
    code: roomCode,
    userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const room = await getRoom(roomCode);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    if (room.activecase !== caseId) {
      return Response.json(
        { error: "Este caso não está ativo para a sua sala." },
        { status: 403 },
      );
    }

    const gameCase = await getCase(caseId);

    if (!gameCase) {
      return Response.json({ error: "Caso não encontrado." }, { status: 404 });
    }

    return Response.json({ case: gameCase });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar caso.", 500);
  }
}
