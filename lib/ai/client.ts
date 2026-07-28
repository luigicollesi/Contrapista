import { getAiConfig } from "@/lib/ai/config";
import { createOpenRouterClient } from "@/lib/ai/providers/openrouter";
import type { AiProviderClient } from "@/lib/ai/types";

let cachedClient: AiProviderClient | null = null;

export function getAiClient(): AiProviderClient {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getAiConfig();

  if (config.provider === "openrouter") {
    cachedClient = createOpenRouterClient();
    return cachedClient;
  }

  throw new Error(`Provider de IA nao suportado: ${config.provider}`);
}
