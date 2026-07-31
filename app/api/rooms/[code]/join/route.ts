import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { joinRoom } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login e escolha um nome de usuário para entrar na sala." },
      { status: 401 },
    );
  }

  const { code } = await params;
  const body = (await request.json()) as {
    browserId?: string;
  };

  try {
    const result = await joinRoom({
      code,
      browserId: body.browserId,
      nickname: session.user.name,
    });

    if (!result) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Erro ao entrar na sala.");
  }
}
