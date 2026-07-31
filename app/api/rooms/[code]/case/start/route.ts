import { auth } from "@/auth";
import { createCaseForRoom, getLastCaseCreationDurationSeconds } from "@/lib/cases";
import { AiModelsUnavailableError, getErrorStatus } from "@/lib/ai/errors";
import { finishRoomCase, getRoom } from "@/lib/rooms";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return Response.json({
    estimatedSeconds: getLastCaseCreationDurationSeconds(),
  });
}

function createErrorId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function isRateLimitError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("free-models-per-day") ||
    normalized.includes("rate limit") ||
    normalized.includes("quota") ||
    normalized.includes("insufficient credits")
  );
}

function isAiTransportError(error: unknown, message: string) {
  const normalized = message.toLowerCase();

  return (
    error instanceof AiModelsUnavailableError ||
    normalized.includes("openrouter retornou http") ||
    normalized.includes("modelo llm falhou") ||
    normalized.includes("modelos llm") ||
    normalized.includes("todos os modelos")
  );
}

function isAiFormatError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("json válido") ||
    normalized.includes("resposta da ia") ||
    normalized.includes("objeto json") ||
    normalized.includes("sem campo válido") ||
    normalized.includes("placeholder") ||
    normalized.includes("perguntas centrais") ||
    normalized.includes("resposta final precisa") ||
    normalized.includes("pistas verdadeiras") ||
    normalized.includes("pistas falsas")
  );
}

function isRoomStateError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("sala não encontrada durante") ||
    normalized.includes("não há jogadores") ||
    normalized.includes("sala mudou de estado") ||
    normalized.includes("sala não estava mais pronta") ||
    normalized.includes("todos os jogadores precisam estar prontos")
  );
}

function isDatabaseError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("database") ||
    normalized.includes("banco") ||
    normalized.includes("relation") ||
    normalized.includes("column") ||
    normalized.includes("constraint") ||
    normalized.includes("duplicate key") ||
    normalized.includes("violates") ||
    normalized.includes("invalid input syntax") ||
    normalized.includes("null value") ||
    normalized.includes("syntax error at or near") ||
    normalized.includes("permission denied")
  );
}

function classifyCaseCreationError(error: unknown, errorId: string) {
  const message = error instanceof Error ? error.message : String(error);
  const status = getErrorStatus(error);

  if (isRateLimitError(message)) {
    return {
      status: 429,
      error:
        "O limite diário dos modelos gratuitos do OpenRouter foi atingido. Voltem para a ante-sala e tentem novamente após o reset diário ou usem uma chave com créditos.",
    };
  }

  if (isAiTransportError(error, message)) {
    return {
      status: status && status >= 400 ? status : 503,
      error:
        "Os modelos de IA estão indisponíveis no momento. Voltem para a ante-sala e tentem novamente mais tarde.",
    };
  }

  if (isAiFormatError(message)) {
    return {
      status: 502,
      error:
        "A IA respondeu fora do formato necessário para montar o caso. Voltem para a ante-sala e tentem novamente.",
    };
  }

  if (isRoomStateError(message)) {
    return {
      status: 409,
      error: message.includes("Voltem")
        ? message
        : `${message} Voltem para a ante-sala e tentem novamente.`,
    };
  }

  if (isDatabaseError(message)) {
    return {
      status: 500,
      error: `Não foi possível salvar o caso no banco de dados. Código do erro: ${errorId}.`,
    };
  }

  if (message.includes("variável de ambiente") || message.includes("LLM_")) {
    return {
      status: 500,
      error: `A configuração de IA do servidor está incompleta. Código do erro: ${errorId}.`,
    };
  }

  return {
    status: 500,
    error: `Erro interno ao criar o caso. Código do erro: ${errorId}.`,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const session = await auth();

    if (!session?.user?.id || !session.user.name) {
      return Response.json(
        { error: "Faça login para criar o caso da partida." },
        { status: 401 },
      );
    }

    const limited = rateLimitResponse({
      identity: session.user.id,
      limit: 5,
      namespace: "case-start",
      request,
      windowMs: 10 * 60_000,
    });

    if (limited) {
      return limited;
    }

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
    };
    const userId = typeof body.userId === "string" ? body.userId : "";

    if (!userId) {
      return Response.json(
        { error: "Sessão local não encontrada. Volte para a ante-sala." },
        { status: 400 },
      );
    }

    const authorizationFailure = await requireAuthorizedRoomUser({
      action: "case-start",
      code,
      userId,
    });

    if (authorizationFailure) {
      return authorizationFailure;
    }

    const room = await getRoom(code);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    if (room.users[0]?.id !== userId) {
      return Response.json(
        { error: "Apenas o responsável da sala pode iniciar a criação do caso." },
        { status: 403 },
      );
    }

    if (!room.activecase && !room.allReady) {
      return Response.json(
        { error: "Todos os jogadores precisam estar prontos." },
        { status: 409 },
      );
    }

    const gameCase = await createCaseForRoom(code);

    return Response.json({ case: gameCase });
  } catch (error) {
    const errorId = createErrorId();
    const originalMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[case-generation:error:${errorId}] code=${code} message=${originalMessage}`,
      error,
    );
    const room = await finishRoomCase({ code }).catch(() => null);
    const classifiedError = classifyCaseCreationError(error, errorId);
    const debugDetails =
      process.env.LLM_DEBUG === "true" ||
      process.env.LLM_DEBUG === "1" ||
      process.env.NODE_ENV !== "production"
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined;

    return Response.json(
      {
        error: classifiedError.error,
        errorId,
        details: debugDetails,
        room,
      },
      { status: classifiedError.status },
    );
  }
}
