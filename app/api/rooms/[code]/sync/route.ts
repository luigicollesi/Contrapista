import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { getRoom } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";
import { rateLimitResponse } from "@/lib/security/rate-limit";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
  };

  if (!body.userId) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 45,
    namespace: "room-sync",
    request,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "room-sync",
    code,
    userId: body.userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const room = await getRoom(code);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    return errorResponse(error, "Erro ao sincronizar sala.");
  }
}
