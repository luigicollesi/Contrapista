import { joinRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    nickname?: string;
    color?: string;
  };

  try {
    const result = await joinRoom({
      code,
      nickname: body.nickname ?? "",
      color: body.color ?? "",
    });

    if (!result) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao entrar na sala.";

    return Response.json({ error: message }, { status: 400 });
  }
}
