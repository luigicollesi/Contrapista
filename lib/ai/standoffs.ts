import "server-only";

import { dbQuery } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

export type PersistedAiModelStandoff = {
  apiKeySlot: string;
  model: string;
  modelSlot: string;
  scope: "key" | "model";
  standoffUntil: number | null;
};

async function ensureAiModelStandoffSchema() {
  schemaReady ??= dbQuery(`
    CREATE TABLE IF NOT EXISTS openrouter_model_standoffs (
      api_key_slot smallint NOT NULL CHECK (api_key_slot BETWEEN 1 AND 7),
      model_slot smallint NOT NULL,
      model text NOT NULL,
      standoff_until timestamptz,
      scope text NOT NULL DEFAULT 'model' CHECK (scope IN ('key', 'model')),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (api_key_slot, model_slot)
    );

    ALTER TABLE openrouter_model_standoffs
      ALTER COLUMN standoff_until DROP NOT NULL;

    ALTER TABLE openrouter_model_standoffs
      ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'model'
      CHECK (scope IN ('key', 'model'));

    CREATE INDEX IF NOT EXISTS openrouter_model_standoffs_until_idx
      ON openrouter_model_standoffs (standoff_until);
  `).then(
    () => undefined,
    (error) => {
      schemaReady = null;
      throw error;
    },
  );

  return schemaReady;
}

export async function listActiveAiModelStandoffs(): Promise<PersistedAiModelStandoff[]> {
  try {
    await ensureAiModelStandoffSchema();
    const result = await dbQuery<{
      api_key_slot: number;
      model: string;
      model_slot: number;
      scope: "key" | "model";
      standoff_until: string | null;
    }>(`
      SELECT api_key_slot, model_slot, model, scope, standoff_until
      FROM openrouter_model_standoffs
      WHERE standoff_until IS NULL OR standoff_until > now()
      ORDER BY standoff_until ASC, api_key_slot ASC, model_slot ASC
    `);

    return result.rows.map((row) => ({
      apiKeySlot: String(row.api_key_slot),
      model: row.model,
      modelSlot: String(row.model_slot),
      scope: row.scope,
      standoffUntil: row.standoff_until
        ? new Date(row.standoff_until).getTime()
        : null,
    }));
  } catch (error) {
    console.error("[AI][standoff] Não foi possível consultar as pausas persistidas.", error);
    return [];
  }
}

export async function saveAiModelStandoff({
  apiKeySlot,
  model,
  modelSlot,
  scope = "model",
  standoffUntil,
}: Omit<PersistedAiModelStandoff, "scope"> & {
  scope?: PersistedAiModelStandoff["scope"];
}) {
  try {
    await ensureAiModelStandoffSchema();
    await dbQuery(
      `
        INSERT INTO openrouter_model_standoffs (
          api_key_slot,
          model_slot,
          model,
          scope,
          standoff_until
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (api_key_slot, model_slot) DO UPDATE
        SET model = EXCLUDED.model,
            scope = EXCLUDED.scope,
            standoff_until = EXCLUDED.standoff_until,
            updated_at = now()
      `,
      [
        apiKeySlot,
        modelSlot,
        model,
        scope,
        standoffUntil ? new Date(standoffUntil).toISOString() : null,
      ],
    );
  } catch (error) {
    console.error("[AI][standoff] Não foi possível persistir a pausa.", error);
  }
}

export async function saveAiKeyStandoff(
  apiKeySlot: string,
  standoffUntil: number | null,
) {
  await saveAiModelStandoff({
    apiKeySlot,
    model: "Todas as combinações",
    modelSlot: "0",
    scope: "key",
    standoffUntil,
  });
}

export async function removeAiModelStandoff(apiKeySlot: string, modelSlot: string) {
  try {
    await ensureAiModelStandoffSchema();
    await dbQuery(
      `
        DELETE FROM openrouter_model_standoffs
        WHERE api_key_slot = $1 AND model_slot = $2
      `,
      [apiKeySlot, modelSlot],
    );
  } catch (error) {
    console.error("[AI][standoff] Não foi possível remover a pausa.", error);
  }
}

export async function removeAiKeyStandoff(apiKeySlot: string) {
  await removeAiModelStandoff(apiKeySlot, "0");
}
