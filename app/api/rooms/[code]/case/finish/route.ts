import { finishRoomCase } from "@/lib/rooms";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const room = await finishRoomCase({ code });

  if (!room) {
    return Response.json({ error: "Sala não encontrada." }, { status: 404 });
  }

  return Response.json({ room });
}
