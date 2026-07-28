import { getAiClient } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import {
  AiModelsUnavailableError,
  getErrorMessage,
  getErrorStatus,
  type AiModelFailure,
} from "@/lib/ai/errors";
import type {
  AiChatCompletionParams,
  AiChatCompletionResult,
} from "@/lib/ai/types";

const MODEL_STANDOFF_MS = 24 * 60 * 60 * 1000;

const modelStandoffUntil = new Map<string, number>();

function getAvailableModels(models: string[], now: number): string[] {
  return models.filter((model) => (modelStandoffUntil.get(model) ?? 0) <= now);
}

function putModelInStandoff(model: string, now: number): void {
  modelStandoffUntil.set(model, now + MODEL_STANDOFF_MS);
}

export async function chatCompletion(
  params: AiChatCompletionParams,
): Promise<AiChatCompletionResult> {
  const config = getAiConfig();
  const client = getAiClient();
  const now = Date.now();
  const models = getAvailableModels(config.models, now);

  if (!models.length) {
    throw new AiModelsUnavailableError(
      "Todos os modelos LLM configurados estão em stand off de 24 horas.",
    );
  }

  const failures: AiModelFailure[] = [];

  for (const model of models) {
    if (config.debug) {
      console.debug(`[AI][request] provider=${config.provider} model=${model}`);
      console.debug("[AI][prompt]", params.messages);
    }

    try {
      const response = await client.chatCompletion({ ...params, model });

      if (config.debug) {
        console.debug("[AI][raw-response]", response.raw);
      }

      return response;
    } catch (error) {
      const failedAt = Date.now();
      putModelInStandoff(model, failedAt);
      failures.push({
        model,
        status: getErrorStatus(error),
        message: getErrorMessage(error),
      });

      if (config.debug) {
        const standoffUntil = new Date(
          failedAt + MODEL_STANDOFF_MS,
        ).toISOString();
        console.error(
          `[AI][error] model=${model} standoffUntil=${standoffUntil}`,
          error,
        );
      }
    }
  }

  const allRateLimited =
    failures.length > 0 && failures.every((failure) => failure.status === 429);
  const hasRateLimit = failures.some((failure) => failure.status === 429);
  const status = allRateLimited ? 429 : hasRateLimit ? 503 : 502;

  throw new AiModelsUnavailableError(
    `Todos os modelos LLM disponíveis falharam: ${failures
      .map(({ model }) => model)
      .join(", ")}`,
    failures,
    status,
  );
}
