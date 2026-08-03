import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { getRoom, getRoomUserByAccountId, publicRoomPreview } from "@/lib/rooms";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const session = await auth();
    const room = await getRoom(code);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    if (!session?.user?.id || !getRoomUserByAccountId(room, session.user.id)) {
      return Response.json({ roomPreview: publicRoomPreview(room) });
    }

    return Response.json({ room });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar sala.", 500);
  }
}
