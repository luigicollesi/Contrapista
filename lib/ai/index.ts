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
  AiProviderModelInfo,
} from "@/lib/ai/types";

const MODEL_STANDOFF_MS = 24 * 60 * 60 * 1000;
const INVALID_RESPONSE_STANDOFF_MS = 5 * 60 * 1000;
const modelStandoffUntil = new Map<string, number>();

type ModelSlot = {
  id: string;
  model: string;
  supportsResponseFormat?: boolean;
};

function looksLikeNonGenerativeModel(model: string) {
  return /(?:embed|embedding|rerank|safety|moderation|guard)/i.test(model);
}

function isTextGenerationModel(info?: AiProviderModelInfo) {
  if (!info) {
    return true;
  }

  return (
    (!info.inputModalities.length || info.inputModalities.includes("text")) &&
    (!info.outputModalities.length || info.outputModalities.includes("text"))
  );
}

async function getModelInfoById() {
  const client = getAiClient();

  if (!client.listModels) {
    return new Map<string, AiProviderModelInfo>();
  }

  try {
    const models = await client.listModels();

    return new Map(models.map((model) => [model.id, model]));
  } catch (error) {
    console.warn(
      "[AI][models] Não foi possível carregar metadados do OpenRouter; usando lista do ambiente.",
      error,
    );
    return new Map<string, AiProviderModelInfo>();
  }
}

async function getModelSlots(models: string[]): Promise<ModelSlot[]> {
  const modelInfoById = await getModelInfoById();

  return models
    .map((model, index): ModelSlot | null => {
      const info = modelInfoById.get(model);

      if (looksLikeNonGenerativeModel(model) || !isTextGenerationModel(info)) {
        return null;
      }

      return {
        id: String(index + 1),
        model,
        supportsResponseFormat: info
          ? info.supportedParameters.includes("response_format")
          : undefined,
      };
    })
    .filter((slot): slot is ModelSlot => Boolean(slot));
}

async function getAvailableModelSlots(
  models: string[],
  now: number,
): Promise<ModelSlot[]> {
  const slots = await getModelSlots(models);

  return slots.filter(
    (slot) => (modelStandoffUntil.get(slot.id) ?? 0) <= now,
  );
}

export async function getAvailableAiModelCount(): Promise<number> {
  return (await getAvailableModelSlots(getAiConfig().models, Date.now())).length;
}

async function getNextAvailableModelSlot(
  models: string[],
  now: number,
): Promise<ModelSlot | null> {
  return (await getAvailableModelSlots(models, now))[0] ?? null;
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
  return status === 400 || status === 404 || status === 422
    ? INVALID_RESPONSE_STANDOFF_MS
    : MODEL_STANDOFF_MS;
}

async function requestModelCompletion({
  params,
  model,
  supportsResponseFormat,
}: {
  params: AiChatCompletionParams;
  model: string;
  supportsResponseFormat?: boolean;
}): Promise<AiChatCompletionResult> {
  const client = getAiClient();
  const { validateText, ...providerParams } = params;
  const initialResponseFormat =
    supportsResponseFormat === false ? undefined : providerParams.responseFormat;

  async function request(responseFormat = initialResponseFormat) {
    const response = await client.chatCompletion({
      ...providerParams,
      responseFormat,
      model,
    });

    try {
      validateText?.(response.text);
    } catch (error) {
      (error as { status?: number }).status = 422;
      throw error;
    }

    return response;
  }

  try {
    return await request();
  } catch (error) {
    const status = getErrorStatus(error);

    if ((status === 400 || status === 404) && providerParams.responseFormat) {
      return request(undefined);
    }

    throw error;
  }
}

export async function chatCompletion(
  params: AiChatCompletionParams,
): Promise<AiChatCompletionResult> {
  const config = getAiConfig();
  const now = Date.now();
  const modelSlot = await getNextAvailableModelSlot(config.models, now);

  if (!modelSlot) {
    throw new AiModelsUnavailableError(
      "Todos os modelos LLM configurados estão temporariamente em espera por falhas de API.",
    );
  }

  const { id: modelSlotId, model, supportsResponseFormat } = modelSlot;

  if (config.debug) {
    console.debug(
      `[AI][request] provider=${config.provider} modelSlot=${modelSlotId} model=${model} responseFormat=${supportsResponseFormat === false ? "disabled" : params.responseFormat ? "enabled" : "none"} sessionId=${params.sessionId ?? "none"}`,
    );
    console.debug("[AI][prompt]", params.messages);
  }

  try {
    const response = await requestModelCompletion({
      params,
      model,
      supportsResponseFormat,
    });

    if (config.debug) {
      console.debug("[AI][raw-response]", response.raw);
      console.debug("[AI][usage]", response.usage);
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
      status ?? 502,
    );
  }
}
