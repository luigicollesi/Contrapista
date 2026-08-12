import { getAiClient } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import {
  listActiveAiModelStandoffs,
  removeAiKeyStandoff,
  removeAiModelStandoff,
  saveAiKeyStandoff,
  saveAiModelStandoff,
} from "@/lib/ai/standoffs";
import { recordOpenRouterUsage } from "@/lib/ai/usage";
import {
  AiModelsUnavailableError,
  getErrorMessage,
  getErrorStatus,
} from "@/lib/ai/errors";
import type {
  AiChatCompletionParams,
  AiChatCompletionResult,
  AiProviderChatCompletionParams,
  AiProviderModelInfo,
} from "@/lib/ai/types";

const MODEL_STANDOFF_MS = 24 * 60 * 60 * 1000;
const INVALID_RESPONSE_STANDOFF_MS = 5 * 60 * 1000;
const MODEL_INFO_CACHE_TTL_MS = 15 * 60 * 1000;
const modelStandoffUntil = new Map<string, number>();
const apiKeyStandoffUntil = new Map<string, number>();
const sessionQueues = new Map<string, Promise<void>>();
let modelInfoCache:
  | {
      expiresAt: number;
      value: Map<string, AiProviderModelInfo>;
    }
  | null = null;

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

export type AiModelStandoffStatus = {
  apiKeySlot: string;
  model?: string;
  modelSlot?: string;
  scope: "key" | "model";
  standoffUntil: number | null;
};

type AiLogValue = string | number | boolean | null | undefined;

function formatAiLog(fields: Record<string, AiLogValue>) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

function logAiInfo(event: string, fields: Record<string, AiLogValue>) {
  console.info(`[AI][${event}] ${formatAiLog(fields)}`);
}

function logAiWarn(event: string, fields: Record<string, AiLogValue>) {
  console.warn(`[AI][${event}] ${formatAiLog(fields)}`);
}

function createAiRequestId() {
  return crypto.randomUUID().slice(0, 8);
}

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
  const now = Date.now();

  if (modelInfoCache && modelInfoCache.expiresAt > now) {
    return modelInfoCache.value;
  }

  const client = getAiClient();

  if (!client.listModels) {
    return new Map<string, AiProviderModelInfo>();
  }

  try {
    const models = await client.listModels();
    const value = new Map(models.map((model) => [model.id, model]));

    modelInfoCache = {
      expiresAt: now + MODEL_INFO_CACHE_TTL_MS,
      value,
    };

    return value;
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
          ? info.supportedParameters.includes("response_format") ||
            info.supportedParameters.includes("structured_outputs")
          : undefined,
      };
    })
    .filter((slot): slot is ModelSlot => Boolean(slot));
}

function getAvailableModelSlots(
  slots: ModelSlot[],
  apiKeySlotId: string,
  now: number,
): ModelSlot[] {
  if ((apiKeyStandoffUntil.get(apiKeySlotId) ?? 0) > now) {
    return [];
  }

  return slots.filter(
    (slot) => (modelStandoffUntil.get(standoffKey(apiKeySlotId, slot.id)) ?? 0) <= now,
  );
}

export async function getAvailableAiModelCount(): Promise<number> {
  const config = getAiConfig();
  const modelSlots = await getModelSlots(config.models);
  const keySlots = getApiKeySlots(config.openRouter.apiKeys);
  await syncModelStandoffs(modelSlots, keySlots);
  const now = Date.now();
  const availableCounts = keySlots.map(
    (keySlot) => getAvailableModelSlots(modelSlots, keySlot.id, now).length,
  );

  return availableCounts.reduce((total, count) => total + count, 0);
}

export async function getAiModelStandoffStatus() {
  const config = getAiConfig();
  const modelSlots = await getModelSlots(config.models);
  const keySlots = getApiKeySlots(config.openRouter.apiKeys);
  await syncModelStandoffs(modelSlots, keySlots);
  const now = Date.now();
  const standoffs: AiModelStandoffStatus[] = [];
  const keys: Array<{
    apiKeySlot: string;
    paused: boolean;
    standoffUntil: number | null;
  }> = [];
  const combinations: Array<{
    apiKeySlot: string;
    model: string;
    modelSlot: string;
    paused: boolean;
    standoffUntil: number | null;
  }> = [];

  for (const apiKeySlot of keySlots) {
    const keyStandoffUntil = apiKeyStandoffUntil.get(apiKeySlot.id) ?? 0;
    const normalizedKeyStandoffUntil = keyStandoffUntil > now
      ? Number.isFinite(keyStandoffUntil) ? keyStandoffUntil : null
      : null;

    keys.push({
      apiKeySlot: apiKeySlot.id,
      paused: keyStandoffUntil > now,
      standoffUntil: normalizedKeyStandoffUntil,
    });

    if (keyStandoffUntil > now) {
      standoffs.push({
        apiKeySlot: apiKeySlot.id,
        scope: "key",
        standoffUntil: normalizedKeyStandoffUntil,
      });
    }

    for (const modelSlot of modelSlots) {
      const standoffUntil = modelStandoffUntil.get(
        standoffKey(apiKeySlot.id, modelSlot.id),
      ) ?? 0;
      const normalizedStandoffUntil = standoffUntil > now
        ? Number.isFinite(standoffUntil) ? standoffUntil : null
        : null;

      combinations.push({
        apiKeySlot: apiKeySlot.id,
        model: modelSlot.model,
        modelSlot: modelSlot.id,
        paused: standoffUntil > now,
        standoffUntil: normalizedStandoffUntil,
      });

      if (standoffUntil > now && keyStandoffUntil <= now) {
        standoffs.push({
          apiKeySlot: apiKeySlot.id,
          model: modelSlot.model,
          modelSlot: modelSlot.id,
          scope: "model",
          standoffUntil: normalizedStandoffUntil,
        });
      }
    }
  }

  const availableCount = combinations.filter(
    (combination) =>
      !combination.paused &&
      keys.find((key) => key.apiKeySlot === combination.apiKeySlot)
        ?.paused === false,
  ).length;

  return {
    availableCount,
    combinations,
    keys,
    standoffs,
    totalCount: keySlots.length * modelSlots.length,
  };
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

async function syncModelStandoffs(slots: ModelSlot[], keySlots: ApiKeySlot[]) {
  const activeStandoffs = await listActiveAiModelStandoffs();
  const relevantKeys = new Set(
    keySlots.flatMap((apiKeySlot) =>
      slots.map((modelSlot) => standoffKey(apiKeySlot.id, modelSlot.id)),
    ),
  );

  for (const key of relevantKeys) {
    modelStandoffUntil.delete(key);
  }

  for (const keySlot of keySlots) {
    apiKeyStandoffUntil.delete(keySlot.id);
  }

  for (const standoff of activeStandoffs) {
    const standoffUntil = standoff.standoffUntil ?? Number.POSITIVE_INFINITY;

    if (standoff.scope === "key" || standoff.modelSlot === "0") {
      if (keySlots.some((keySlot) => keySlot.id === standoff.apiKeySlot)) {
        apiKeyStandoffUntil.set(standoff.apiKeySlot, standoffUntil);
      }
      continue;
    }

    const key = standoffKey(standoff.apiKeySlot, standoff.modelSlot);

    if (relevantKeys.has(key)) {
      modelStandoffUntil.set(key, standoffUntil);
    }
  }
}

function getModelSlotsWithStandoffState(
  slots: ModelSlot[],
  apiKeySlotId: string,
  now: number,
) {
  if ((apiKeyStandoffUntil.get(apiKeySlotId) ?? 0) > now) {
    return [];
  }

  return slots.map((slot) => {
    const standoffUntil = modelStandoffUntil.get(
      standoffKey(apiKeySlotId, slot.id),
    ) ?? 0;

    return {
      ...slot,
      standoffUntil,
      available: standoffUntil <= now,
    };
  });
}

function getNextAvailableRequestSlot(
  modelSlots: ModelSlot[],
  apiKeys: string[],
  now: number,
  excludedCombinations = new Set<string>(),
): RequestSlot | null {
  for (const apiKeySlot of getApiKeySlots(apiKeys)) {
    const slots = getModelSlotsWithStandoffState(
      modelSlots,
      apiKeySlot.id,
      now,
    );
    const modelSlot = slots.find(
      (slot) =>
        slot.available &&
        !excludedCombinations.has(standoffKey(apiKeySlot.id, slot.id)),
    );

    for (const skippedSlot of slots.filter((slot) => !slot.available)) {
      logAiInfo("skip-model", {
        action: "skip",
        reason: "standoff",
        apiKeySlot: apiKeySlot.id,
        modelSlot: skippedSlot.id,
        model: skippedSlot.model,
        standoffUntil: new Date(skippedSlot.standoffUntil).toISOString(),
      });
    }

    if (modelSlot) {
      return { apiKeySlot, modelSlot };
    }

    logAiInfo("skip-api-key", {
      action: "skip",
      reason: "no-available-models",
      apiKeySlot: apiKeySlot.id,
    });
  }

  return null;
}

async function putModelSlotInStandoff(
  apiKeySlotId: string,
  modelSlot: ModelSlot,
  now: number,
  duration = MODEL_STANDOFF_MS,
): Promise<void> {
  const standoffUntil = now + duration;
  modelStandoffUntil.set(standoffKey(apiKeySlotId, modelSlot.id), standoffUntil);
  await saveAiModelStandoff({
    apiKeySlot: apiKeySlotId,
    model: modelSlot.model,
    modelSlot: modelSlot.id,
    standoffUntil,
  });
}

async function putApiKeyModelsInStandoff(
  apiKeySlotId: string,
  slots: ModelSlot[],
  now: number,
  duration = MODEL_STANDOFF_MS,
): Promise<void> {
  await Promise.all(
    slots.map((slot) => putModelSlotInStandoff(apiKeySlotId, slot, now, duration)),
  );
}

export async function clearAiModelStandoff(apiKeySlotId: string, modelSlotId: string) {
  modelStandoffUntil.delete(standoffKey(apiKeySlotId, modelSlotId));
  await removeAiModelStandoff(apiKeySlotId, modelSlotId);
}

export async function clearAiKeyStandoff(apiKeySlotId: string) {
  apiKeyStandoffUntil.delete(apiKeySlotId);
  await removeAiKeyStandoff(apiKeySlotId);
}

export async function setAiKeyStandoff(
  apiKeySlotId: string,
  standoffUntil: number | null,
) {
  apiKeyStandoffUntil.set(apiKeySlotId, standoffUntil ?? Number.POSITIVE_INFINITY);
  await saveAiKeyStandoff(apiKeySlotId, standoffUntil);
}

function isApiKeyScopedFailure(status: number | undefined, message: string) {
  if (status === 401 || status === 402 || status === 403) {
    return true;
  }

  if (status !== 429) {
    return false;
  }

  return /(?:free-models-per-day|rate.?limit|quota|credit|insufficient)/i.test(
    message,
  );
}

function getModelStandoffDuration(status?: number, message = ""): number {
  if (status === 404 && /unavailable for free/i.test(message)) {
    return MODEL_STANDOFF_MS;
  }

  return status === 400 || status === 404 || status === 408 || status === 422 || status === 504
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
  apiKeySlot,
  model,
  modelSlot,
  supportsResponseFormat,
  requestId,
}: {
  params: AiChatCompletionParams;
  apiKey: string;
  apiKeySlot: string;
  model: string;
  modelSlot: string;
  supportsResponseFormat?: boolean;
  requestId: string;
}): Promise<AiChatCompletionResult> {
  const client = getAiClient();
  const { validateText } = params;
  const providerParams: Omit<AiProviderChatCompletionParams, "apiKey" | "model"> = {
    maxTokens: params.maxTokens,
    messages: params.messages,
    responseFormat: params.responseFormat,
    sessionId: params.sessionId,
    temperature: params.temperature,
  };
  const initialResponseFormat =
    supportsResponseFormat === false ? undefined : providerParams.responseFormat;

  async function request(responseFormat = initialResponseFormat) {
    logAiInfo("provider-request", {
      requestId,
      action: "send",
      model,
      responseFormat: responseFormat ? "enabled" : "none",
      sessionId: params.sessionId ?? "none",
    });
    await params.onProgress?.({
      type: "request_sent",
      apiKeySlot,
      model,
      modelSlot,
    });

    const response = await client.chatCompletion({
      ...providerParams,
      apiKey,
      responseFormat,
      model,
    });
    await params.onProgress?.({
      type: "response_received",
      apiKeySlot,
      model,
      modelSlot,
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

    if (
      (status === 400 || status === 404) &&
      providerParams.responseFormat?.type === "json_schema"
    ) {
      logAiWarn("provider-retry", {
        requestId,
        action: "retry-without-response-format",
        reason: `http-${status}`,
        model,
      });
      await params.onProgress?.({
        type: "provider_retry",
        apiKeySlot,
        model,
        modelSlot,
      });
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
  const requestId = createAiRequestId();
  const now = Date.now();
  const modelSlots = await getModelSlots(config.models);
  const apiKeySlots = getApiKeySlots(config.openRouter.apiKeys);
  await syncModelStandoffs(modelSlots, apiKeySlots);
  const requestSlot = getNextAvailableRequestSlot(
    modelSlots,
    config.openRouter.apiKeys,
    now,
    new Set(params.excludedCombinations),
  );

  if (!requestSlot) {
    logAiWarn("unavailable", {
      requestId,
      action: "fail-request",
      reason: "all-combinations-in-standoff",
      sessionId: params.sessionId ?? "none",
    });
    throw new AiModelsUnavailableError(
      "Todas as combinações de chave e modelo LLM configuradas estão temporariamente em espera por falhas de API.",
    );
  }

  const { apiKeySlot, modelSlot } = requestSlot;
  const { id: modelSlotId, model, supportsResponseFormat } = modelSlot;

  logAiInfo("try-model", {
    requestId,
    action: "try",
    provider: config.provider,
    apiKeySlot: apiKeySlot.id,
    modelSlot: modelSlotId,
    model,
    responseFormat:
      supportsResponseFormat === false
        ? "disabled"
        : params.responseFormat
          ? "enabled"
          : "none",
    sessionId: params.sessionId ?? "none",
  });
  await params.onProgress?.({
    type: "model_selected",
    apiKeySlot: apiKeySlot.id,
    model,
    modelSlot: modelSlotId,
  });

  if (config.debug) {
    console.debug(
      `[AI][request] requestId=${requestId} provider=${config.provider} apiKeySlot=${apiKeySlot.id} modelSlot=${modelSlotId} model=${model} responseFormat=${supportsResponseFormat === false ? "disabled" : params.responseFormat ? "enabled" : "none"} sessionId=${params.sessionId ?? "none"}`,
    );
    console.debug("[AI][prompt]", params.messages);
  }

  try {
    const response = await requestModelCompletion({
      params,
      apiKey: apiKeySlot.apiKey,
      apiKeySlot: apiKeySlot.id,
      model,
      modelSlot: modelSlotId,
      supportsResponseFormat,
      requestId,
    });

    try {
      await recordOpenRouterUsage({
        apiKeySlot: Number(apiKeySlot.id),
        model,
        requestId,
        usage: response.usage,
      });
      await params.onProgress?.({
        type: "usage_recorded",
        apiKeySlot: apiKeySlot.id,
        model,
        modelSlot: modelSlotId,
        usage: response.usage,
      });
    } catch (usageError) {
      console.warn("[AI][usage] Não foi possível registrar o consumo da requisição.", usageError);
      await params.onProgress?.({
        type: "usage_record_failed",
        apiKeySlot: apiKeySlot.id,
        model,
        modelSlot: modelSlotId,
      });
    }

    logAiInfo("model-success", {
      requestId,
      action: "accept",
      apiKeySlot: apiKeySlot.id,
      modelSlot: modelSlotId,
      model,
      promptTokens: response.usage?.promptTokens,
      completionTokens: response.usage?.completionTokens,
      totalTokens: response.usage?.totalTokens,
    });

    if (config.debug) {
      console.debug("[AI][raw-response]", response.raw);
      console.debug("[AI][usage]", response.usage);
    }

    return response;
  } catch (error) {
    const failedAt = Date.now();
    const status = getErrorStatus(error);
    const message = getErrorMessage(error);
    const standoffDuration = getModelStandoffDuration(status, message);
    const apiKeyScopedFailure = isApiKeyScopedFailure(status, message);
    const failureSource = status === 422 ? "local-validation" : "provider";
    const standoffUntil = new Date(failedAt + standoffDuration).toISOString();
    const action = apiKeyScopedFailure
      ? "standoff-api-key-models"
      : "standoff-model";

    if (apiKeyScopedFailure) {
      await putApiKeyModelsInStandoff(
        apiKeySlot.id,
        modelSlots,
        failedAt,
        standoffDuration,
      );
    } else {
      await putModelSlotInStandoff(
        apiKeySlot.id,
        modelSlot,
        failedAt,
        standoffDuration,
      );
    }

    logAiWarn("model-failure", {
      requestId,
      action,
      apiKeySlot: apiKeySlot.id,
      modelSlot: modelSlotId,
      model,
      status: status ?? "unknown",
      failureSource,
      standoffScope: apiKeyScopedFailure ? "api-key" : "model",
      standoffDurationMs: standoffDuration,
      standoffUntil,
      reason: message.slice(0, 220).replace(/\s+/g, " "),
    });
    await params.onProgress?.({
      type: "provider_failure",
      apiKeySlot: apiKeySlot.id,
      model,
      modelSlot: modelSlotId,
    });

    if (config.debug) {
      console.error(
        `[AI][error] requestId=${requestId} apiKeySlot=${apiKeySlot.id} modelSlot=${modelSlotId} model=${model} action=${action} standoffScope=${apiKeyScopedFailure ? "api-key" : "model"} standoffUntil=${standoffUntil ?? "not-applied"}`,
        error,
      );
    }

    throw new AiModelsUnavailableError(
      `Modelo LLM falhou e entrou em espera: ${model}`,
      [
        {
          model,
          status,
          message,
        },
      ],
      status ?? 502,
    );
  }
}
