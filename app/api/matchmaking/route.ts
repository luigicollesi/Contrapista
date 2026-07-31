import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { ensureUserAchievements } from "@/lib/auth-users";
import {
  heartbeatMatchmakingQueue,
  isMatchmakingMode,
  joinMatchmakingQueue,
  readMatchmakingStatus,
} from "@/lib/matchmaking";
import { rateLimitResponse } from "@/lib/security/rate-limit";

async function getQueueIdentity() {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return null;
  }

  const achievements = await ensureUserAchievements(session.user.id);

  return {
    displayName: session.user.name,
    rating: achievements?.ranked_rating ?? 1000,
    userId: session.user.id,
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    browserId?: string;
    mode?: string;
  };

  if (!isMatchmakingMode(body.mode)) {
    return Response.json({ error: "Modo de jogo inválido." }, { status: 400 });
  }

  try {
    const identity = await getQueueIdentity();

    if (!identity) {
      return Response.json(
        { error: "Faça login e escolha um nome de usuário para entrar na fila." },
        { status: 401 },
      );
    }

    const limited = rateLimitResponse({
      identity: identity.userId,
      limit: 12,
      namespace: "matchmaking-join",
      request,
      windowMs: 5 * 60_000,
    });

    if (limited) {
      return limited;
    }

    return Response.json(
      await joinMatchmakingQueue({
        browserId: body.browserId,
        displayName: identity.displayName,
        mode: body.mode,
        rating: identity.rating,
        userId: identity.userId,
      }),
    );
  } catch (error) {
    return errorResponse(error, "Erro ao entrar na fila.");
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const browserId = url.searchParams.get("browserId") ?? undefined;
  const heartbeat = url.searchParams.get("heartbeat") === "1";

  if (!isMatchmakingMode(mode)) {
    return Response.json({ error: "Modo de jogo inválido." }, { status: 400 });
  }

  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login para consultar a fila." },
      { status: 401 },
    );
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: heartbeat ? 90 : 30,
    namespace: heartbeat ? "matchmaking-heartbeat" : "matchmaking-status",
    request,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  try {
    return Response.json(
      heartbeat
        ? await heartbeatMatchmakingQueue({ browserId, mode })
        : await readMatchmakingStatus({ browserId, mode }),
    );
  } catch (error) {
    return errorResponse(error, "Erro ao consultar fila.");
  }
}
