import { getRoom } from "@/lib/rooms";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const room = await getRoom(code);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao carregar sala.";

    return Response.json({ error: message }, { status: 500 });
  }
}
