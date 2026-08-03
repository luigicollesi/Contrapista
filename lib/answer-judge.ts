import "server-only";

import { chatCompletion, getAvailableAiModelCount } from "@/lib/ai";
import { AiModelsUnavailableError } from "@/lib/ai/errors";

const MIN_ANSWER_JUDGE_ATTEMPTS = 3;
const MAX_ANSWER_JUDGE_ATTEMPTS = 5;

export function parseAiBoolean(text: string): boolean | null {
  const normalized = text.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  try {
    const parsed = JSON.parse(text.trim()) as unknown;

    if (typeof parsed === "boolean") {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { correct?: unknown }).correct === "boolean"
    ) {
      return (parsed as { correct: boolean }).correct;
    }
  } catch {
    // Fall back to extracting a clear boolean token from prose.
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof (parsed as { correct?: unknown }).correct === "boolean"
      ) {
        return (parsed as { correct: boolean }).correct;
      }
    } catch {
      // Continue to token extraction.
    }
  }

  const matches = normalized.match(/\b(?:true|false)\b/g) ?? [];
  const uniqueMatches = Array.from(new Set(matches));

  if (uniqueMatches.length !== 1) {
    return null;
  }

  return uniqueMatches[0] === "true";
}

async function requestAnswerJudgement({
  attempt,
  finalAnswer,
  guess,
  sessionId,
}: {
  attempt: number;
  finalAnswer: string;
  guess: string;
  sessionId: string;
}) {
  console.info(
    `[AI][answer-judge-attempt] sessionId=${sessionId} attempt=${attempt} action=try`,
  );

  const response = await chatCompletion({
    temperature: 0,
    maxTokens: 120,
    sessionId,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "contrapista_answer_judgement",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["correct"],
          properties: {
            correct: {
              type: "boolean",
              description:
                "true se o palpite resolve as mesmas ideias centrais da resposta oficial; false caso contrário.",
            },
          },
        },
      },
    },
    validateText: (text) => {
      if (parseAiBoolean(text) === null) {
        throw new Error(`A IA respondeu avaliação inválida: ${text.slice(0, 80)}`);
      }
    },
    messages: [
      {
        role: "system",
        content:
          'Você é um juiz de equivalência semântica de respostas de jogo investigativo. Responda somente JSON válido no formato {"correct":true} ou {"correct":false}. Use true quando o palpite tiver a mesma ideia central da resposta oficial, mesmo com sinônimos, ordem diferente, erros ortográficos ou texto incompleto. Use false quando faltar culpado, método, motivo ou contradição central exigida pela resposta oficial. Não explique.',
      },
      {
        role: "user",
        content: `Compare as duas respostas.

Resposta oficial:
${finalAnswer}

Palpite do jogador:
${guess}

O palpite resolve corretamente as perguntas centrais do caso?`,
      },
    ],
  });
  const parsed = parseAiBoolean(response.text);

  if (parsed === null) {
    throw new Error(`A IA respondeu avaliação inválida: ${response.text.slice(0, 80)}`);
  }

  console.info(
    `[AI][answer-judge-result] sessionId=${sessionId} attempt=${attempt} action=accept correct=${parsed}`,
  );

  return parsed;
}

export async function evaluateAnswer({
  finalAnswer,
  guess,
  sessionId,
}: {
  finalAnswer: string;
  guess: string;
  sessionId: string;
}) {
  const normalizedGuess = guess.trim();

  if (!normalizedGuess) {
    return false;
  }

  const maxAttempts = Math.max(
    MIN_ANSWER_JUDGE_ATTEMPTS,
    Math.min(MAX_ANSWER_JUDGE_ATTEMPTS, await getAvailableAiModelCount()),
  );
  const errors: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestAnswerJudgement({
        attempt,
        finalAnswer,
        guess: normalizedGuess,
        sessionId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);

      console.warn(
        `[AI][answer-judge-failure] sessionId=${sessionId} attempt=${attempt} action=retry reason=${message}`,
      );

      if (
        error instanceof AiModelsUnavailableError &&
        error.failures.length === 0
      ) {
        break;
      }
    }
  }

  throw new Error(
    `Não foi possível avaliar a resposta com IA: ${errors.join(" | ")}`,
  );
}
