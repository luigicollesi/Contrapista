import { setRoomUserReady } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    userId?: string;
    ready?: boolean;
  };

  if (!body.userId) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  try {
    const room = await setRoomUserReady({
      code,
      userId: body.userId,
      ready: Boolean(body.ready),
    });

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao alterar pronto.";

    return Response.json({ error: message }, { status: 400 });
  }
}
