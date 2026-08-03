import "server-only";

import { dbQuery, getDbClient, type DatabaseConnection } from "@/lib/db";
import {
  DEFAULT_ROOM_CONFIG,
  ensureRoomsSchema,
  getRoom,
  toRoomNickname,
  type RoomMode,
  type RoomUser,
} from "@/lib/rooms";
import { validateDisplayNamePolicy } from "@/lib/name-policy";

export type MatchmakingMode = Extract<RoomMode, "casual" | "ranked">;

type QueueRow = {
  id: string;
  browser_id: string;
  user_id: string | null;
  display_name: string;
  mode: MatchmakingMode;
  rating: number;
  matched_room_code: string | null;
  room_user_id: string | null;
  created_at: string;
  updated_at: string;
};

const MATCH_SIZE = 4;
const RANKED_RATING_RANGE = 300;
const QUEUE_HEARTBEAT_TIMEOUT_SECONDS = 20;

function normalizeBrowserId(browserId?: string) {
  return browserId && browserId.trim().length >= 8
    ? browserId.trim().slice(0, 80)
    : crypto.randomUUID();
}

export function isMatchmakingMode(value: unknown): value is MatchmakingMode {
  return value === "casual" || value === "ranked";
}

async function ensureMatchmakingSchema() {
  await ensureRoomsSchema();
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS matchmaking_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      browser_id text NOT NULL,
      user_id uuid,
      display_name text NOT NULL DEFAULT 'Investigador',
      mode text NOT NULL CHECK (mode IN ('casual', 'ranked')),
      rating integer NOT NULL DEFAULT 1000,
      matched_room_code text,
      room_user_id text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS matchmaking_queue_waiting_idx
      ON matchmaking_queue (mode, matched_room_code, created_at);

    CREATE INDEX IF NOT EXISTS matchmaking_queue_browser_mode_idx
      ON matchmaking_queue (browser_id, mode, updated_at DESC);
  `);

  await dbQuery(`
    ALTER TABLE matchmaking_queue
      ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Investigador';
  `);
}

async function createMatchRoom({
  client,
  mode,
  players,
}: {
  client: DatabaseConnection;
  mode: MatchmakingMode;
  players: QueueRow[];
}) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const now = Date.now();
    const users: RoomUser[] = players.map((player) => ({
      id: crypto.randomUUID(),
      accountUserId: player.user_id,
      browserId: player.browser_id,
      nickname: player.display_name,
      color: null,
      ready: false,
      joinedAt: now,
      lastSeenAt: now,
    }));

    const roomResult = await client.query<{ id: string; code: string }>(
      `
        INSERT INTO game_rooms (room_code, users, activecase, mode)
        VALUES ($1, $2::jsonb, NULL, $3)
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id, room_code AS code
      `,
      [code, JSON.stringify(users), mode],
    );
    const room = roomResult.rows[0];

    if (!room) {
      continue;
    }

    const configResult = await client.query<{ id: string }>(
      `
        INSERT INTO game_rooms_config (
          room_id,
          reading_time_seconds,
          clue_selection_time_seconds,
          revealed_clue_analysis_time_seconds,
          round_analysis_time_seconds,
          final_guess_time_seconds,
          true_clues_per_player,
          clues_per_player
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id::text AS id
      `,
      [
        room.id,
        DEFAULT_ROOM_CONFIG.readingTimeSeconds,
        DEFAULT_ROOM_CONFIG.clueSelectionTimeSeconds,
        DEFAULT_ROOM_CONFIG.revealedClueAnalysisTimeSeconds,
        DEFAULT_ROOM_CONFIG.roundAnalysisTimeSeconds,
        DEFAULT_ROOM_CONFIG.finalGuessTimeSeconds,
        DEFAULT_ROOM_CONFIG.trueCluesPerPlayer,
        DEFAULT_ROOM_CONFIG.cluesPerPlayer,
      ],
    );

    await client.query(
      `UPDATE game_rooms SET config_id = $2::uuid WHERE id = $1::uuid`,
      [room.id, configResult.rows[0].id],
    );

    for (const [index, player] of players.entries()) {
      await client.query(
        `
            UPDATE matchmaking_queue
            SET matched_room_code = $2,
                room_user_id = $3,
                updated_at = now()
            WHERE id = $1::uuid
          `,
        [player.id, code, users[index].id],
      );
    }

    return { code, users };
  }

  throw new Error("Não deu para formar uma mesa agora.");
}

async function getQueueStatus({
  browserId,
  mode,
}: {
  browserId: string;
  mode: MatchmakingMode;
}) {
  const result = await dbQuery<QueueRow>(
    `
      SELECT
        id::text AS id,
        browser_id,
        user_id::text AS user_id,
        display_name,
        mode,
        rating,
        matched_room_code,
        room_user_id,
        created_at,
        updated_at
      FROM matchmaking_queue
      WHERE browser_id = $1
        AND mode = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [browserId, mode],
  );
  const row = result.rows[0];

  if (!row?.matched_room_code || !row.room_user_id) {
    if (row) {
      await dbQuery(
        `
          UPDATE matchmaking_queue
          SET updated_at = now()
          WHERE id = $1::uuid
            AND matched_room_code IS NULL
        `,
        [row.id],
      );
    }

    return {
      matched: false,
      mode,
      waiting: Boolean(row),
    };
  }

  const room = await getRoom(row.matched_room_code);
  const user = room?.users.find((item) => item.id === row.room_user_id) ?? null;

  return room && user
    ? { matched: true, mode, room, user }
    : { matched: false, mode, waiting: false };
}

export async function readMatchmakingStatus({
  browserId,
  mode,
}: {
  browserId?: string;
  mode: MatchmakingMode;
}) {
  await ensureMatchmakingSchema();

  return getQueueStatus({ browserId: normalizeBrowserId(browserId), mode });
}

export async function joinMatchmakingQueue({
  browserId,
  displayName,
  mode,
  rating,
  userId,
}: {
  browserId?: string;
  displayName: string;
  mode: MatchmakingMode;
  rating?: number;
  userId?: string | null;
}) {
  await ensureMatchmakingSchema();

  const normalizedBrowserId = normalizeBrowserId(browserId);
  const normalizedDisplayName = toRoomNickname(displayName);
  const normalizedRating = Math.max(0, Math.round(rating ?? 1000));

  if (!normalizedDisplayName) {
    throw new Error("Entre e escolha seu nome antes de entrar na fila.");
  }

  const namePolicy = validateDisplayNamePolicy(normalizedDisplayName);

  if (!namePolicy.ok) {
    throw new Error(namePolicy.message);
  }

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await client.query(
      `
        DELETE FROM matchmaking_queue
        WHERE updated_at < now() - ($1::int * interval '1 second')
          AND matched_room_code IS NULL
      `,
      [QUEUE_HEARTBEAT_TIMEOUT_SECONDS],
    );

    const existingMatched = await client.query<QueueRow>(
      `
        SELECT
          id::text AS id,
          browser_id,
          user_id::text AS user_id,
          display_name,
          mode,
          rating,
          matched_room_code,
          room_user_id,
          created_at,
          updated_at
        FROM matchmaking_queue
        WHERE browser_id = $1
          AND mode = $2
          AND matched_room_code IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [normalizedBrowserId, mode],
    );

    if (existingMatched.rows[0]) {
      await client.query("COMMIT");
      return getQueueStatus({ browserId: normalizedBrowserId, mode });
    }

    await client.query(
      `
        DELETE FROM matchmaking_queue
        WHERE browser_id = $1
          AND mode = $2
          AND matched_room_code IS NULL
      `,
      [normalizedBrowserId, mode],
    );

    await client.query(
      `
        INSERT INTO matchmaking_queue (browser_id, user_id, display_name, mode, rating)
        VALUES ($1, $2::uuid, $3, $4, $5)
      `,
      [normalizedBrowserId, userId ?? null, normalizedDisplayName, mode, normalizedRating],
    );

    const candidates = await client.query<QueueRow>(
      mode === "ranked"
        ? `
          SELECT
            id::text AS id,
            browser_id,
            user_id::text AS user_id,
            display_name,
            mode,
            rating,
            matched_room_code,
            room_user_id,
            created_at,
            updated_at
          FROM matchmaking_queue
          WHERE mode = $1
            AND matched_room_code IS NULL
            AND updated_at >= now() - ($4::int * interval '1 second')
            AND abs(rating - $2) <= $3
          ORDER BY abs(rating - $2), created_at
          LIMIT ${MATCH_SIZE}
          FOR UPDATE
        `
        : `
          SELECT
            id::text AS id,
            browser_id,
            user_id::text AS user_id,
            display_name,
            mode,
            rating,
            matched_room_code,
            room_user_id,
            created_at,
            updated_at
          FROM matchmaking_queue
          WHERE mode = $1
            AND matched_room_code IS NULL
            AND updated_at >= now() - ($2::int * interval '1 second')
          ORDER BY created_at
          LIMIT ${MATCH_SIZE}
          FOR UPDATE
        `,
      mode === "ranked"
        ? [mode, normalizedRating, RANKED_RATING_RANGE, QUEUE_HEARTBEAT_TIMEOUT_SECONDS]
        : [mode, QUEUE_HEARTBEAT_TIMEOUT_SECONDS],
    );

    if (candidates.rows.length >= MATCH_SIZE) {
      await createMatchRoom({
        client,
        mode,
        players: candidates.rows.slice(0, MATCH_SIZE),
      });
    }

    await client.query("COMMIT");

    return getQueueStatus({ browserId: normalizedBrowserId, mode });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatMatchmakingQueue({
  browserId,
  mode,
}: {
  browserId?: string;
  mode: MatchmakingMode;
}) {
  await ensureMatchmakingSchema();

  const normalizedBrowserId = normalizeBrowserId(browserId);

  await dbQuery(
    `
      UPDATE matchmaking_queue
      SET updated_at = now()
      WHERE browser_id = $1
        AND mode = $2
        AND matched_room_code IS NULL
    `,
    [normalizedBrowserId, mode],
  );

  return getQueueStatus({ browserId: normalizedBrowserId, mode });
}
