import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { createRoom } from "@/lib/rooms";
import { rateLimitResponse } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Entre e escolha seu nome para criar sala." },
      { status: 401 },
    );
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 10,
    namespace: "rooms-create",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      browserId?: string;
    };

    return Response.json(
      await createRoom({
        accountUserId: session.user.id,
        browserId: body.browserId,
        nickname: session.user.name,
      }),
    );
  } catch (error) {
    return errorResponse(error, "Não deu para criar sala.", 500);
  }
}
