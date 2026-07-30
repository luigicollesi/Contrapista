export type LlmProvider = "openrouter";

export type AiRole = "system" | "user" | "assistant";

export type AiChatMessage = {
  role: AiRole;
  content: string;
};

export type AiChatCompletionParams = {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  sessionId?: string;
  validateText?: (text: string) => void;
  responseFormat?:
    | {
        type: "json_object";
      }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict?: boolean;
          schema: Record<string, unknown>;
        };
      };
};

export type AiProviderChatCompletionParams = Omit<
  AiChatCompletionParams,
  "validateText"
> & {
  apiKey: string;
  model: string;
};

export type AiChatCompletionResult = {
  text: string;
  raw: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cachedTokens?: number;
    cacheWriteTokens?: number;
  };
};

export type AiProviderModelInfo = {
  id: string;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
};

export type AiProviderClient = {
  chatCompletion(
    params: AiProviderChatCompletionParams,
  ): Promise<AiChatCompletionResult>;
  listModels?(): Promise<AiProviderModelInfo[]>;
};

export type OpenRouterConfig = {
  apiKeys: string[];
  baseUrl: string;
  appName?: string;
  appUrl?: string;
  providerRouting?: {
    allowFallbacks?: boolean;
    dataCollection?: "allow" | "deny";
    zdr?: boolean;
    requireParameters?: boolean;
    only?: string[];
    ignore?: string[];
  };
};

export type AiConfig = {
  provider: LlmProvider;
  models: string[];
  debug: boolean;
  openRouter: OpenRouterConfig;
};
