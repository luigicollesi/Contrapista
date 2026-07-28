import { getRoom } from "@/lib/rooms";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const room = await getRoom(code);

  if (!room) {
    return Response.json({ error: "Sala nao encontrada." }, { status: 404 });
  }

  return Response.json({ room });
}
