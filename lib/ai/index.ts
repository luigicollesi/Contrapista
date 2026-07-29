import { getAiClient } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import {
  AiModelsUnavailableError,
  getErrorMessage,
  getErrorStatus,
} from "@/lib/ai/errors";
import type {
  AiChatCompletionParams,
  AiChatCompletionResult,
} from "@/lib/ai/types";

const MODEL_STANDOFF_MS = 24 * 60 * 60 * 1000;
const INVALID_RESPONSE_STANDOFF_MS = 5 * 60 * 1000;
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

function getNextAvailableModelSlot(
  models: string[],
  now: number,
): ModelSlot | null {
  return getAvailableModelSlots(models, now)[0] ?? null;
}

function putModelSlotInStandoff(
  slotId: string,
  now: number,
  duration = MODEL_STANDOFF_MS,
): void {
  modelStandoffUntil.set(slotId, now + duration);
}

function shouldPutModelInStandoff(status?: number): boolean {
  return status !== 401 && status !== 403;
}

function getModelStandoffDuration(status?: number): number {
  return status === 422 ? INVALID_RESPONSE_STANDOFF_MS : MODEL_STANDOFF_MS;
}

export async function chatCompletion(
  params: AiChatCompletionParams,
): Promise<AiChatCompletionResult> {
  const config = getAiConfig();
  const client = getAiClient();
  const now = Date.now();
  const modelSlot = getNextAvailableModelSlot(config.models, now);

  if (!modelSlot) {
    throw new AiModelsUnavailableError(
      "Todos os modelos LLM configurados estão temporariamente em espera por falhas de API.",
    );
  }

  const { id: modelSlotId, model } = modelSlot;

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
    const shouldStandoff = shouldPutModelInStandoff(status);
    const standoffDuration = getModelStandoffDuration(status);

    if (shouldStandoff) {
      putModelSlotInStandoff(modelSlotId, failedAt, standoffDuration);
    }

    if (config.debug) {
      const standoffUntil = shouldStandoff
        ? new Date(failedAt + standoffDuration).toISOString()
        : "not-applied";
      console.error(
        `[AI][error] modelSlot=${modelSlotId} model=${model} standoffUntil=${standoffUntil}`,
        error,
      );
    }

    throw new AiModelsUnavailableError(
      `Modelo LLM falhou${shouldStandoff ? " e entrou em espera" : ""}: ${model}`,
      [
        {
          model,
          status,
          message: getErrorMessage(error),
        },
      ],
      status === 429 ? 429 : status && status >= 500 ? 503 : 502,
    );
  }
}
