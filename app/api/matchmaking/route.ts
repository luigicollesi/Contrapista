import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { ensureUserAchievements } from "@/lib/auth-users";
import {
  heartbeatMatchmakingQueue,
  isMatchmakingMode,
  joinMatchmakingQueue,
  leaveMatchmakingQueue,
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
    action?: string;
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
        { error: "Entre e escolha seu nome para entrar na fila." },
        { status: 401 },
      );
    }

    const isHeartbeat = body.action === "heartbeat";
    const limited = rateLimitResponse({
      identity: identity.userId,
      limit: isHeartbeat ? 90 : 12,
      namespace: isHeartbeat ? "matchmaking-heartbeat" : "matchmaking-join",
      request,
      windowMs: isHeartbeat ? 60_000 : 5 * 60_000,
    });

    if (limited) {
      return limited;
    }

    if (isHeartbeat) {
      return Response.json(
        await heartbeatMatchmakingQueue({
          browserId: body.browserId,
          mode: body.mode,
          userId: identity.userId,
        }),
      );
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
    return errorResponse(error, "Não deu para entrar na fila.");
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const browserId = url.searchParams.get("browserId") ?? undefined;

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
    limit: 30,
    namespace: "matchmaking-status",
    request,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  try {
    return Response.json(
      await readMatchmakingStatus({ browserId, mode, userId: session.user.id }),
    );
  } catch (error) {
    return errorResponse(error, "Erro ao consultar fila.");
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    browserId?: string;
    mode?: string;
  };

  if (!isMatchmakingMode(body.mode)) {
    return Response.json({ error: "Modo de jogo inválido." }, { status: 400 });
  }

  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login para sair da fila." },
      { status: 401 },
    );
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 20,
    namespace: "matchmaking-leave",
    request,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  try {
    return Response.json(
      await leaveMatchmakingQueue({
        browserId: body.browserId,
        mode: body.mode,
        userId: session.user.id,
      }),
    );
  } catch (error) {
    return errorResponse(error, "Erro ao sair da fila.");
  }
}
