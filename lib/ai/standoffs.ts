import "server-only";

import { dbQuery } from "@/lib/db";

let schemaReady: Promise<void> | null = null;

export type PersistedAiModelStandoff = {
  apiKeySlot: string;
  model: string;
  modelSlot: string;
  standoffUntil: number;
};

async function ensureAiModelStandoffSchema() {
  schemaReady ??= dbQuery(`
    CREATE TABLE IF NOT EXISTS openrouter_model_standoffs (
      api_key_slot smallint NOT NULL CHECK (api_key_slot BETWEEN 1 AND 7),
      model_slot smallint NOT NULL,
      model text NOT NULL,
      standoff_until timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (api_key_slot, model_slot)
    );

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
      standoff_until: string;
    }>(`
      SELECT api_key_slot, model_slot, model, standoff_until
      FROM openrouter_model_standoffs
      WHERE standoff_until > now()
      ORDER BY standoff_until ASC, api_key_slot ASC, model_slot ASC
    `);

    return result.rows.map((row) => ({
      apiKeySlot: String(row.api_key_slot),
      model: row.model,
      modelSlot: String(row.model_slot),
      standoffUntil: new Date(row.standoff_until).getTime(),
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
  standoffUntil,
}: PersistedAiModelStandoff) {
  try {
    await ensureAiModelStandoffSchema();
    await dbQuery(
      `
        INSERT INTO openrouter_model_standoffs (
          api_key_slot,
          model_slot,
          model,
          standoff_until
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (api_key_slot, model_slot) DO UPDATE
        SET model = EXCLUDED.model,
            standoff_until = EXCLUDED.standoff_until,
            updated_at = now()
      `,
      [apiKeySlot, modelSlot, model, new Date(standoffUntil).toISOString()],
    );
  } catch (error) {
    console.error("[AI][standoff] Não foi possível persistir a pausa.", error);
  }
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
