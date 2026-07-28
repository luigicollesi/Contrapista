import type { AiConfig, LlmProvider } from "@/lib/ai/types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const MAX_LLM_MODELS = 5;

function isTruthy(value?: string): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseOptionalBool(value?: string): boolean | undefined {
  if (!value) return undefined;
  return isTruthy(value);
}

function parseCsv(value?: string): string[] | undefined {
  if (!value) return undefined;

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : undefined;
}

function parseDataCollection(value?: string): "allow" | "deny" | undefined {
  if (!value) return undefined;

  const normalized = value.trim().toLowerCase();

  if (normalized === "allow" || normalized === "deny") {
    return normalized;
  }

  throw new Error('LLM_OPENROUTER_DATA_COLLECTION deve ser "allow" ou "deny".');
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`A variavel de ambiente ${name} nao esta definida.`);
  }

  return value;
}

function parseProvider(rawProvider?: string): LlmProvider {
  const provider = (rawProvider ?? "openrouter").trim().toLowerCase();

  if (provider !== "openrouter") {
    throw new Error(
      `LLM_PROVIDER invalido: "${provider}". Valor suportado: "openrouter".`,
    );
  }

  return provider;
}

function parseModels(): string[] {
  const models = Array.from({ length: MAX_LLM_MODELS }, (_, index) =>
    process.env[`LLM_MODEL${index + 1}`]?.trim(),
  ).filter((model): model is string => Boolean(model));

  return models.length ? models : [DEFAULT_MODEL];
}

let cachedConfig: AiConfig | null = null;

export function getAiConfig(): AiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const provider = parseProvider(process.env.LLM_PROVIDER);

  cachedConfig = {
    provider,
    models: parseModels(),
    debug: isTruthy(process.env.LLM_DEBUG),
    openRouter: {
      apiKey: requireEnv("LLM_OPENROUTER_API_KEY"),
      baseUrl:
        process.env.LLM_OPENROUTER_BASE_URL?.trim() || OPENROUTER_BASE_URL,
      appName: process.env.LLM_OPENROUTER_APP_NAME?.trim() || undefined,
      appUrl: process.env.LLM_OPENROUTER_APP_URL?.trim() || undefined,
      providerRouting: {
        allowFallbacks: parseOptionalBool(
          process.env.LLM_OPENROUTER_ALLOW_FALLBACKS,
        ),
        dataCollection: parseDataCollection(
          process.env.LLM_OPENROUTER_DATA_COLLECTION,
        ),
        zdr: parseOptionalBool(process.env.LLM_OPENROUTER_ZDR),
        only: parseCsv(process.env.LLM_OPENROUTER_ONLY),
        ignore: parseCsv(process.env.LLM_OPENROUTER_IGNORE),
      },
    },
  };

  return cachedConfig;
}
