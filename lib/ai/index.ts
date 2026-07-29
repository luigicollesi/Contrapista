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

type ModelSlot = {
  id: string;
  model: string;
};

function getModelSlots(models: string[]): ModelSlot[] {
  return models.map((model, index) => ({
    id: String(index + 1),
    model,
  }));
}

function getAvailableModelSlots(models: string[], now: number): ModelSlot[] {
  return getModelSlots(models).filter(
    (slot) => (modelStandoffUntil.get(slot.id) ?? 0) <= now,
  );
}

function putModelSlotInStandoff(
  slotId: string,
  now: number,
  duration = MODEL_STANDOFF_MS,
): void {
  modelStandoffUntil.set(slotId, now + duration);
}

function shouldPutModelInStandoff(status?: number): boolean {
  if (status === undefined) {
    return true;
  }

  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export async function chatCompletion(
  params: AiChatCompletionParams,
): Promise<AiChatCompletionResult> {
  const config = getAiConfig();
  const client = getAiClient();
  const now = Date.now();
  const modelSlots = getAvailableModelSlots(config.models, now);

  if (!modelSlots.length) {
    throw new AiModelsUnavailableError(
      "Todos os modelos LLM configurados estão temporariamente em espera por falhas de API.",
    );
  }

  const failures: AiModelFailure[] = [];

  for (const { id: modelSlotId, model } of modelSlots) {
    if (config.debug) {
      console.debug(
        `[AI][request] provider=${config.provider} modelSlot=${modelSlotId} model=${model}`,
      );
      console.debug("[AI][prompt]", params.messages);
    }

    try {
      const { validateText, ...providerParams } = params;
      const response = await client.chatCompletion({ ...providerParams, model });

      try {
        validateText?.(response.text);
      } catch (error) {
        (error as { status?: number }).status = 422;
        throw error;
      }

      if (config.debug) {
        console.debug("[AI][raw-response]", response.raw);
      }

      return response;
    } catch (error) {
      const failedAt = Date.now();
      const status = getErrorStatus(error);
      if (shouldPutModelInStandoff(status)) {
        putModelSlotInStandoff(modelSlotId, failedAt);
      }
      failures.push({
        model,
        status,
        message: getErrorMessage(error),
      });

      if (config.debug) {
        const standoffUntil =
          shouldPutModelInStandoff(status)
            ? new Date(failedAt + MODEL_STANDOFF_MS).toISOString()
            : "not-applied";
        console.error(
          `[AI][error] modelSlot=${modelSlotId} model=${model} standoffUntil=${standoffUntil}`,
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
