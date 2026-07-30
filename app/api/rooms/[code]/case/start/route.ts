import { createCaseForRoom, getLastCaseCreationDurationSeconds } from "@/lib/cases";
import { AiModelsUnavailableError, getErrorStatus } from "@/lib/ai/errors";
import { finishRoomCase, getRoom } from "@/lib/rooms";

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
    normalized.includes("placeholder")
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

  if (message.includes("DATABASE") || message.includes("banco")) {
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
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const room = await getRoom(code);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
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
    console.error(`[case-generation:error:${errorId}]`, error);
    const room = await finishRoomCase({ code }).catch(() => null);
    const classifiedError = classifyCaseCreationError(error, errorId);
    const debugDetails =
      process.env.LLM_DEBUG === "true" || process.env.LLM_DEBUG === "1"
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
