import { returnRoomCaseToLobby } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = body.userId?.trim();

  if (!userId) {
    return Response.json({ error: "Usuário não informado." }, { status: 400 });
  }

  const room = await returnRoomCaseToLobby({ code, userId });

  if (!room) {
    return Response.json({ error: "Sala não encontrada." }, { status: 404 });
  }

  return Response.json({ room });
}
