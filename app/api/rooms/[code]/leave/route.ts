import { leaveRoom } from "@/lib/rooms";

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

  const room = await leaveRoom({ code, userId: body.userId });

  if (!room) {
    return Response.json({ error: "Sala não encontrada." }, { status: 404 });
  }

  return Response.json({ room });
}
