import { skipGamePhase } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as { userId?: string };

  if (!body.userId) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  try {
    const gamestate = await skipGamePhase({ code, userId: body.userId });

    if (!gamestate) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ gamestate });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao pular fase.";

    return Response.json({ error: message }, { status: 400 });
  }
}
