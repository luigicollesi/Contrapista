import "server-only";

import { dbQuery } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

type UsageRow = {
  model: string;
  requests: number;
  total_tokens: string;
};

export async function ensureOpenRouterUsageSchema() {
  schemaReady ??= dbQuery(`
    CREATE TABLE IF NOT EXISTS openrouter_request_usage (
      id bigserial PRIMARY KEY,
      request_id text NOT NULL,
      api_key_slot smallint NOT NULL CHECK (api_key_slot BETWEEN 1 AND 7),
      model text NOT NULL,
      prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
      completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
      total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
      cached_tokens integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
      cache_write_tokens integer NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS openrouter_request_usage_created_at_idx
      ON openrouter_request_usage (created_at DESC);
    CREATE INDEX IF NOT EXISTS openrouter_request_usage_model_created_at_idx
      ON openrouter_request_usage (model, created_at DESC);
  `).then(
    () => undefined,
    (error) => {
      schemaReady = null;
      throw error;
    },
  );

  return schemaReady;
}

function tokenCount(value: number | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

export async function recordOpenRouterUsage({
  apiKeySlot,
  model,
  requestId,
  usage,
}: {
  apiKeySlot: number;
  model: string;
  requestId: string;
  usage?: {
    cachedTokens?: number;
    cacheWriteTokens?: number;
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
  };
}) {
  await ensureOpenRouterUsageSchema();
  await dbQuery(
    `
      INSERT INTO openrouter_request_usage (
        request_id,
        api_key_slot,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cached_tokens,
        cache_write_tokens
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      requestId,
      apiKeySlot,
      model,
      tokenCount(usage?.promptTokens),
      tokenCount(usage?.completionTokens),
      tokenCount(usage?.totalTokens),
      tokenCount(usage?.cachedTokens),
      tokenCount(usage?.cacheWriteTokens),
    ],
  );
}

export async function getTodayFreeModelUsage() {
  await ensureOpenRouterUsageSchema();

  const result = await dbQuery<UsageRow>(`
    SELECT
      model,
      count(*)::int AS requests,
      coalesce(sum(total_tokens), 0)::bigint::text AS total_tokens
    FROM openrouter_request_usage
    WHERE model ILIKE '%:free'
      AND created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
    GROUP BY model
    ORDER BY requests DESC, model ASC
  `);

  const models = result.rows.map((row) => ({
    model: row.model,
    requests: row.requests,
    totalTokens: Number(row.total_tokens),
  }));

  return {
    requests: models.reduce((total, item) => total + item.requests, 0),
    models,
  };
}
