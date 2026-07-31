import { errorResponse } from "@/lib/api-response";
import { shareRoomClue } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    clueText?: string;
    clueNumber?: number;
    clueId?: string;
  };

  if (!body.userId || !body.clueText || typeof body.clueNumber !== "number") {
    return Response.json({ error: "Pista inválida." }, { status: 400 });
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "room-share-clue",
    code,
    userId: body.userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const gamestate = await shareRoomClue({
      code,
      userId: body.userId,
      clueText: body.clueText,
      clueNumber: body.clueNumber,
      clueId: body.clueId,
    });

    if (!gamestate) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ gamestate });
  } catch (error) {
    return errorResponse(error, "Erro ao compartilhar pista.");
  }
}
