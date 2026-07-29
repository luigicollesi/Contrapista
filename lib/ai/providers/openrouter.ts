import { getAiConfig } from "@/lib/ai/config";
import type {
  AiChatCompletionResult,
  AiProviderChatCompletionParams,
  AiProviderClient,
} from "@/lib/ai/types";

export function createOpenRouterClient(): AiProviderClient {
  const config = getAiConfig();
  const defaultHeaders: Record<string, string> = {};

  if (config.openRouter.appUrl) {
    defaultHeaders["HTTP-Referer"] = config.openRouter.appUrl;
  }

  if (config.openRouter.appName) {
    defaultHeaders["X-Title"] = config.openRouter.appName;
  }

  return {
    async chatCompletion(
      params: AiProviderChatCompletionParams,
    ): Promise<AiChatCompletionResult> {
      const routing = config.openRouter.providerRouting;
      const provider =
        routing &&
        (routing.allowFallbacks !== undefined ||
          routing.dataCollection !== undefined ||
          routing.zdr !== undefined ||
          routing.only?.length ||
          routing.ignore?.length)
          ? {
              allow_fallbacks: routing.allowFallbacks,
              data_collection: routing.dataCollection,
              zdr: routing.zdr,
              only: routing.only,
              ignore: routing.ignore,
            }
          : undefined;

      const requestBody: Record<string, unknown> = {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        response_format: params.responseFormat,
      };

      if (provider) {
        requestBody.provider = provider;
      }

      const response = await fetch(`${config.openRouter.baseUrl}/chat/completions`, {
        body: JSON.stringify(requestBody),
        headers: {
          ...defaultHeaders,
          Authorization: `Bearer ${config.openRouter.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const responseText = await response.text();

      if (!response.ok) {
        const error = new Error(
          `OpenRouter retornou HTTP ${response.status}: ${responseText.slice(0, 240)}`,
        );

        (error as { status?: number }).status = response.status;
        throw error;
      }

      let data: {
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
      };
    },
  };
}
