import { errorResponse } from "@/lib/api-response";
import { skipGamePhase } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as { userId?: string };

  if (!body.userId) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "game-skip",
    code,
    userId: body.userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const gamestate = await skipGamePhase({ code, userId: body.userId });

    if (!gamestate) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ gamestate });
  } catch (error) {
    return errorResponse(error, "Erro ao pular fase.");
  }
}
