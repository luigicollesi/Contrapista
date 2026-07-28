import OpenAI from "openai";

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

  const client = new OpenAI({
    apiKey: config.openRouter.apiKey,
    baseURL: config.openRouter.baseUrl,
    defaultHeaders,
  });

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

      const response = await client.chat.completions.create(
        requestBody as never,
      );
      const text = response.choices?.[0]?.message?.content?.trim() || "";

      return {
        text,
        raw: response,
      };
    },
  };
}
