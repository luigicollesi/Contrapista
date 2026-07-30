import { errorResponse } from "@/lib/api-response";
import { joinRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    browserId?: string;
    nickname?: string;
    color?: string;
  };

  try {
    const result = await joinRoom({
      code,
      browserId: body.browserId,
      nickname: body.nickname ?? "",
      color: body.color ?? "",
    });

    if (!result) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Erro ao entrar na sala.");
  }
}
