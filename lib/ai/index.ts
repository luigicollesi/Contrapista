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
const sessionQueues = new Map<string, Promise<void>>();

type ModelSlot = {
  id: string;
  model: string;
  supportsResponseFormat?: boolean;
};

type ApiKeySlot = {
  id: string;
  apiKey: string;
};

type RequestSlot = {
  apiKeySlot: ApiKeySlot;
  modelSlot: ModelSlot;
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
  apiKeySlotId: string,
  now: number,
): Promise<ModelSlot[]> {
  const slots = await getModelSlots(models);

  return slots.filter(
    (slot) => (modelStandoffUntil.get(standoffKey(apiKeySlotId, slot.id)) ?? 0) <= now,
  );
}

export async function getAvailableAiModelCount(): Promise<number> {
  const config = getAiConfig();
  const keySlots = getApiKeySlots(config.openRouter.apiKeys);
  const availableCounts = await Promise.all(
    keySlots.map((keySlot) =>
      getAvailableModelSlots(config.models, keySlot.id, Date.now()).then(
        (slots) => slots.length,
      ),
    ),
  );

  return availableCounts.reduce((total, count) => total + count, 0);
}

function getApiKeySlots(apiKeys: string[]): ApiKeySlot[] {
  return apiKeys.map((apiKey, index) => ({
    id: String(index + 1),
    apiKey,
  }));
}

function standoffKey(apiKeySlotId: string, modelSlotId: string) {
  return `${apiKeySlotId}:${modelSlotId}`;
}

async function getNextAvailableRequestSlot(
  models: string[],
  apiKeys: string[],
  now: number,
): Promise<RequestSlot | null> {
  for (const apiKeySlot of getApiKeySlots(apiKeys)) {
    const [modelSlot] = await getAvailableModelSlots(
      models,
      apiKeySlot.id,
      now,
    );

    if (modelSlot) {
      return { apiKeySlot, modelSlot };
    }
  }

  return null;
}

function putModelSlotInStandoff(
  apiKeySlotId: string,
  modelSlotId: string,
  now: number,
  duration = MODEL_STANDOFF_MS,
): void {
  modelStandoffUntil.set(standoffKey(apiKeySlotId, modelSlotId), now + duration);
}

function shouldPutModelInStandoff(): boolean {
  return true;
}

function getModelStandoffDuration(status?: number): number {
  return status === 400 || status === 404 || status === 422
    ? INVALID_RESPONSE_STANDOFF_MS
    : MODEL_STANDOFF_MS;
}

async function runExclusiveForSession<T>(
  sessionId: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  if (!sessionId) {
    return operation();
  }

  const previous = sessionQueues.get(sessionId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(() => current, () => current);

  sessionQueues.set(sessionId, next);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    release();

    if (sessionQueues.get(sessionId) === next) {
      sessionQueues.delete(sessionId);
    }
  }
}

async function requestModelCompletion({
  params,
  apiKey,
  model,
  supportsResponseFormat,
}: {
  params: AiChatCompletionParams;
  apiKey: string;
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
      apiKey,
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
  return runExclusiveForSession(params.sessionId, () =>
    executeChatCompletion(params),
  );
}

async function executeChatCompletion(
  params: AiChatCompletionParams,
): Promise<AiChatCompletionResult> {
  const config = getAiConfig();
  const now = Date.now();
  const requestSlot = await getNextAvailableRequestSlot(
    config.models,
    config.openRouter.apiKeys,
    now,
  );

  if (!requestSlot) {
    throw new AiModelsUnavailableError(
      "Todas as combinações de chave e modelo LLM configuradas estão temporariamente em espera por falhas de API.",
    );
  }

  const { apiKeySlot, modelSlot } = requestSlot;
  const { id: modelSlotId, model, supportsResponseFormat } = modelSlot;

  if (config.debug) {
    console.debug(
      `[AI][request] provider=${config.provider} apiKeySlot=${apiKeySlot.id} modelSlot=${modelSlotId} model=${model} responseFormat=${supportsResponseFormat === false ? "disabled" : params.responseFormat ? "enabled" : "none"} sessionId=${params.sessionId ?? "none"}`,
    );
    console.debug("[AI][prompt]", params.messages);
  }

  try {
    const response = await requestModelCompletion({
      params,
      apiKey: apiKeySlot.apiKey,
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
    const shouldStandoff = shouldPutModelInStandoff();
    const standoffDuration = getModelStandoffDuration(status);

    if (shouldStandoff) {
      putModelSlotInStandoff(
        apiKeySlot.id,
        modelSlotId,
        failedAt,
        standoffDuration,
      );
    }

    if (config.debug) {
      const standoffUntil = shouldStandoff
        ? new Date(failedAt + standoffDuration).toISOString()
        : "not-applied";
      console.error(
        `[AI][error] apiKeySlot=${apiKeySlot.id} modelSlot=${modelSlotId} model=${model} standoffUntil=${standoffUntil}`,
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
