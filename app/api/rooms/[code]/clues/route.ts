import { shareRoomClue } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    userId?: string;
    clueText?: string;
    clueNumber?: number;
    clueId?: string;
  };

  if (!body.userId || !body.clueText || typeof body.clueNumber !== "number") {
    return Response.json({ error: "Pista inválida." }, { status: 400 });
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
    const message =
      error instanceof Error ? error.message : "Erro ao compartilhar pista.";

    return Response.json({ error: message }, { status: 400 });
  }
}
