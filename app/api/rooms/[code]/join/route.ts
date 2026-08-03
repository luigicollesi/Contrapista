import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { joinRoom } from "@/lib/rooms";
import { rateLimitResponse } from "@/lib/security/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Entre e escolha seu nome para entrar na sala." },
      { status: 401 },
    );
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 20,
    namespace: "rooms-join",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    browserId?: string;
  };

  try {
    const result = await joinRoom({
      accountUserId: session.user.id,
      code,
      browserId: body.browserId,
      nickname: session.user.name,
    });

    if (!result) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "Não deu para entrar na sala.");
  }
}
