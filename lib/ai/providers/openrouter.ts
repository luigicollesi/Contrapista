import { getAiConfig } from "@/lib/ai/config";
import type {
  AiChatCompletionResult,
  AiProviderChatCompletionParams,
  AiProviderClient,
  AiProviderModelInfo,
} from "@/lib/ai/types";

const MODEL_LIST_CACHE_MS = 10 * 60 * 1000;

let modelListCache:
  | {
      expiresAt: number;
      models: AiProviderModelInfo[];
    }
  | undefined;

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "")).filter(Boolean)
    : [];
}

export function createOpenRouterClient(): AiProviderClient {
  const config = getAiConfig();
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.openRouter.appUrl) {
    defaultHeaders["HTTP-Referer"] = config.openRouter.appUrl;
  }

  if (config.openRouter.appName) {
    defaultHeaders["X-Title"] = config.openRouter.appName;
  }

  if (config.debug) {
    defaultHeaders["X-OpenRouter-Metadata"] = "enabled";
  }

  return {
    async listModels(): Promise<AiProviderModelInfo[]> {
      if (modelListCache && modelListCache.expiresAt > Date.now()) {
        return modelListCache.models;
      }

      const response = await fetch(`${config.openRouter.baseUrl}/models`, {
        headers: {
          ...defaultHeaders,
          Authorization: `Bearer ${config.openRouter.apiKeys[0]}`,
        },
        method: "GET",
      });
      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `OpenRouter retornou HTTP ${response.status} ao listar modelos: ${responseText.slice(0, 240)}`,
        );
      }

      const data = JSON.parse(responseText) as {
        data?: Array<{
          id?: string;
          architecture?: {
            input_modalities?: unknown;
            output_modalities?: unknown;
          };
          supported_parameters?: unknown;
        }>;
      };
      const models = (data.data ?? [])
        .map((model): AiProviderModelInfo | null => {
          if (!model.id) {
            return null;
          }

          return {
            id: model.id,
            inputModalities: normalizeStringArray(
              model.architecture?.input_modalities,
            ),
            outputModalities: normalizeStringArray(
              model.architecture?.output_modalities,
            ),
            supportedParameters: normalizeStringArray(
              model.supported_parameters,
            ),
          };
        })
        .filter((model): model is AiProviderModelInfo => Boolean(model));

      modelListCache = {
        expiresAt: Date.now() + MODEL_LIST_CACHE_MS,
        models,
      };

      return models;
    },

    async chatCompletion(
      params: AiProviderChatCompletionParams,
    ): Promise<AiChatCompletionResult> {
      const routing = config.openRouter.providerRouting;
      const requireParameters =
        routing?.requireParameters ?? Boolean(params.responseFormat);
      const provider =
        routing &&
        (routing.allowFallbacks !== undefined ||
          routing.dataCollection !== undefined ||
          routing.zdr !== undefined ||
          requireParameters ||
          routing.only?.length ||
          routing.ignore?.length)
          ? {
              allow_fallbacks: routing.allowFallbacks,
              data_collection: routing.dataCollection,
              zdr: routing.zdr,
              require_parameters: requireParameters,
              only: routing.only,
              ignore: routing.ignore,
            }
          : undefined;

      const requestBody: Record<string, unknown> = {
        model: params.model,
        session_id: params.sessionId,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        response_format: params.responseFormat,
        stream: false,
      };

      if (provider) {
        requestBody.provider = provider;
      }

      const response = await fetch(`${config.openRouter.baseUrl}/chat/completions`, {
        body: JSON.stringify(requestBody),
        headers: {
          ...defaultHeaders,
          Authorization: `Bearer ${params.apiKey}`,
        },
        method: "POST",
      });
      const responseText = await response.text();

      if (!response.ok) {
        let errorDetail = responseText.slice(0, 500);

        try {
          const errorData = JSON.parse(responseText) as {
            error?: { message?: string; code?: number | string };
            message?: string;
          };
          errorDetail =
            errorData.error?.message ?? errorData.message ?? errorDetail;
        } catch {
          // Keep the raw response excerpt.
        }

        const error = new Error(
          `OpenRouter retornou HTTP ${response.status}: ${errorDetail}`,
        );

        (error as { status?: number }).status = response.status;
        throw error;
      }

      let data: {
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          prompt_tokens_details?: {
            cached_tokens?: number;
            cache_write_tokens?: number;
          };
        };
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      };

      try {
        data = JSON.parse(responseText) as typeof data;
      } catch {
        throw new Error(
          `OpenRouter retornou uma resposta não JSON: ${responseText.slice(0, 240)}`,
        );
      }

      const text = data.choices?.[0]?.message?.content?.trim() || "";

      return {
        text,
        raw: data,
        usage: {
          promptTokens: data.usage?.prompt_tokens,
          completionTokens: data.usage?.completion_tokens,
          totalTokens: data.usage?.total_tokens,
          cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens,
          cacheWriteTokens:
            data.usage?.prompt_tokens_details?.cache_write_tokens,
        },
      };
    },
  };
}
