import { chatCompletion } from "@/lib/ai";
import { dbQuery, getDbClient, type DatabaseClient } from "@/lib/db";
import {
  isPlayerColor,
  normalizePlayerColor,
  type PlayerColor,
} from "@/lib/player-colors";

export type RoomUser = {
  id: string;
  nickname: string;
  color: PlayerColor;
  ready: boolean;
  joinedAt: number;
};

export type RoomConfig = {
  readingTimeSeconds: number;
  clueSelectionTimeSeconds: number;
  revealedClueAnalysisTimeSeconds: number;
  roundAnalysisTimeSeconds: number;
  finalGuessTimeSeconds: number;
  trueCluesPerPlayer: number;
  cluesPerPlayer: number;
};

export type Room = {
  code: string;
  users: RoomUser[];
  activecase: string | null;
  activeevent: RoomEvent | null;
  gamestate: GameState | null;
  config?: RoomConfig;
};

export type RoomEvent = {
  id: string;
  type: "solution" | "solution_correct" | "solution_wrong";
  actorId: string;
  actorNickname: string;
  createdAt: number;
  guess?: string;
};

export type GameState = {
  phase: "ready" | "reading" | "roulette" | "turn" | "shared_clue" | "pause";
  round: number;
  order: string[];
  currentTurnIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  roulettePool?: string[];
  rouletteSelectedId?: string;
  pausedAt?: number;
  pausedRemainingMs?: number;
  readyUserIds?: string[];
  eliminatedUserIds?: string[];
  returnedToLobbyUserIds?: string[];
  skipVotes?: {
    phaseKey: string;
    userIds: string[];
  };
  sharedClueIds?: Record<string, string[]>;
  sharedClue?: {
    id: string;
    actorId: string;
    actorNickname: string;
    clueText: string;
    clueNumber: number;
    clueId?: string;
    autoShared?: boolean;
    createdAt: number;
  };
};

const ROOM_EMPTY_TTL_SQL = "1 hour";
const ROULETTE_MS = 3_000;

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  readingTimeSeconds: 120,
  clueSelectionTimeSeconds: 10,
  revealedClueAnalysisTimeSeconds: 30,
  roundAnalysisTimeSeconds: 60,
  finalGuessTimeSeconds: 30,
  trueCluesPerPlayer: 3,
  cluesPerPlayer: 6,
};

const ROOM_CONFIG_LIMITS = {
  readingTimeSeconds: { min: 0, max: 300 },
  clueSelectionTimeSeconds: { min: 5, max: 60 },
  revealedClueAnalysisTimeSeconds: { min: 10, max: 120 },
  roundAnalysisTimeSeconds: { min: 0, max: 180 },
  finalGuessTimeSeconds: { min: 20, max: 180 },
  trueCluesPerPlayer: { min: 0, max: 10 },
  cluesPerPlayer: { min: 2, max: 10 },
} satisfies Record<keyof RoomConfig, { min: number; max: number }>;

let schemaReady: Promise<void> | null = null;

function normalizeUsers(users: unknown): RoomUser[] {
  if (!Array.isArray(users)) {
    return [];
  }

  return users.map((user) => {
    const partial = user as Partial<RoomUser> & { color?: string };

    return {
      id: String(partial.id ?? crypto.randomUUID()),
      nickname: String(partial.nickname ?? "Jogador").slice(0, 18),
      color: normalizePlayerColor(String(partial.color ?? "red")),
      ready: Boolean(partial.ready),
      joinedAt:
        typeof partial.joinedAt === "number" ? partial.joinedAt : Date.now(),
    };
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfigNumber(
  value: unknown,
  key: keyof RoomConfig,
): number {
  const limits = ROOM_CONFIG_LIMITS[key];
  const numericValue = typeof value === "number" ? value : Number(value);
  const fallback = DEFAULT_ROOM_CONFIG[key];

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return clampNumber(Math.round(numericValue), limits.min, limits.max);
}

function normalizeRoomConfig(value: unknown): RoomConfig {
  const data = value as Partial<RoomConfig> & Record<string, unknown>;

  return {
    readingTimeSeconds: normalizeConfigNumber(
      data.readingTimeSeconds ?? data.reading_time_seconds,
      "readingTimeSeconds",
    ),
    clueSelectionTimeSeconds: normalizeConfigNumber(
      data.clueSelectionTimeSeconds ?? data.clue_selection_time_seconds,
      "clueSelectionTimeSeconds",
    ),
    revealedClueAnalysisTimeSeconds: normalizeConfigNumber(
      data.revealedClueAnalysisTimeSeconds ??
        data.revealed_clue_analysis_time_seconds,
      "revealedClueAnalysisTimeSeconds",
    ),
    roundAnalysisTimeSeconds: normalizeConfigNumber(
      data.roundAnalysisTimeSeconds ?? data.round_analysis_time_seconds,
      "roundAnalysisTimeSeconds",
    ),
    finalGuessTimeSeconds: normalizeConfigNumber(
      data.finalGuessTimeSeconds ?? data.final_guess_time_seconds,
      "finalGuessTimeSeconds",
    ),
    cluesPerPlayer: normalizeConfigNumber(
      data.cluesPerPlayer ?? data.clues_per_player,
      "cluesPerPlayer",
    ),
    trueCluesPerPlayer: Math.min(
      normalizeConfigNumber(
        data.trueCluesPerPlayer ?? data.true_clues_per_player,
        "trueCluesPerPlayer",
      ),
      normalizeConfigNumber(data.cluesPerPlayer ?? data.clues_per_player, "cluesPerPlayer"),
    ),
  };
}

function durationMs(seconds: number) {
  return seconds * 1000;
}

function publicRoom(room: Room) {
  const config = room.config ?? DEFAULT_ROOM_CONFIG;

  return {
    code: room.code,
    users: room.users,
    userCount: room.users.length,
    activecase: room.activecase,
    activeevent: room.activeevent,
    gamestate: room.gamestate,
    config,
    allReady: room.users.length > 0 && room.users.every((user) => user.ready),
  };
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seedValue: string) {
  const shuffled = [...items];
  let seed = hashString(seedValue);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const swapIndex = seed % (index + 1);
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function normalizeGameState(value: unknown): GameState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Partial<GameState>;

  if (
    state.phase !== "ready" &&
    state.phase !== "reading" &&
    state.phase !== "roulette" &&
    state.phase !== "turn" &&
    state.phase !== "shared_clue" &&
    state.phase !== "pause"
  ) {
    return null;
  }

  return {
    phase: state.phase,
    round: typeof state.round === "number" ? state.round : 1,
    order: Array.isArray(state.order) ? state.order.map(String) : [],
    currentTurnIndex:
      typeof state.currentTurnIndex === "number" ? state.currentTurnIndex : 0,
    phaseStartedAt:
      typeof state.phaseStartedAt === "number" ? state.phaseStartedAt : Date.now(),
    phaseEndsAt:
      typeof state.phaseEndsAt === "number" ? state.phaseEndsAt : Date.now(),
    roulettePool: Array.isArray(state.roulettePool)
      ? state.roulettePool.map(String)
      : undefined,
    rouletteSelectedId:
      typeof state.rouletteSelectedId === "string"
        ? state.rouletteSelectedId
        : undefined,
    pausedAt: typeof state.pausedAt === "number" ? state.pausedAt : undefined,
    pausedRemainingMs:
      typeof state.pausedRemainingMs === "number"
        ? state.pausedRemainingMs
        : undefined,
    readyUserIds: Array.isArray(state.readyUserIds)
      ? state.readyUserIds.map(String)
      : [],
    eliminatedUserIds: Array.isArray(state.eliminatedUserIds)
      ? state.eliminatedUserIds.map(String)
      : [],
    returnedToLobbyUserIds: Array.isArray(state.returnedToLobbyUserIds)
      ? state.returnedToLobbyUserIds.map(String)
      : [],
    skipVotes:
      state.skipVotes && typeof state.skipVotes === "object"
        ? {
            phaseKey: String(state.skipVotes.phaseKey ?? ""),
            userIds: Array.isArray(state.skipVotes.userIds)
              ? state.skipVotes.userIds.map(String)
              : [],
          }
        : undefined,
    sharedClueIds:
      state.sharedClueIds && typeof state.sharedClueIds === "object"
        ? Object.fromEntries(
            Object.entries(state.sharedClueIds).map(([id, clues]) => [
              id,
              Array.isArray(clues) ? clues.map(String) : [],
            ]),
          )
        : {},
    sharedClue: state.sharedClue,
  };
}

function reconcileOrder(order: string[], users: RoomUser[], seed: string) {
  const userIds = users.map((user) => user.id);
  const kept = order.filter((id) => userIds.includes(id));
  const missing = userIds.filter((id) => !kept.includes(id));

  return [...kept, ...seededShuffle(missing, seed)];
}

function initialGameState(room: Room, now: number): GameState | null {
  if (!room.activecase || !room.users.length) {
    return null;
  }

  return {
    phase: "ready",
    round: 1,
    order: [],
    currentTurnIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now,
    readyUserIds: [],
    eliminatedUserIds: [],
    returnedToLobbyUserIds: [],
    sharedClueIds: {},
  };
}

function startReadingPhase(state: GameState, now: number, config: RoomConfig) {
  return {
    ...state,
    phase: "reading",
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.readingTimeSeconds),
    skipVotes: undefined,
    sharedClue: undefined,
  } satisfies GameState;
}

function areAllUsersReady(userIds: string[], readyUserIds: string[]) {
  return userIds.length > 0 && userIds.every((id) => readyUserIds.includes(id));
}

function phaseSkipKey(state: GameState) {
  return `${state.phase}:${state.round}:${state.currentTurnIndex}:${state.phaseStartedAt}`;
}

function getActiveUsers(state: GameState, users: RoomUser[]) {
  const eliminated = new Set(state.eliminatedUserIds ?? []);

  return users.filter((user) => !eliminated.has(user.id));
}

function addEliminatedUser(state: GameState, userId: string) {
  return Array.from(new Set([...(state.eliminatedUserIds ?? []), userId]));
}

function startRouletteSpin(
  state: GameState,
  users: RoomUser[],
  now: number,
  seed: string,
) {
  const userIds = users.map((user) => user.id);
  const existingOrder = state.order.filter((id) => userIds.includes(id));
  const pool =
    state.roulettePool?.filter((id) => userIds.includes(id)) ??
    userIds.filter((id) => !existingOrder.includes(id));
  const selectedId =
    pool.length === 1
      ? pool[0]
      : seededShuffle(pool, `${seed}:${existingOrder.length}:${state.round}`)[0];

  return {
    ...state,
    phase: "roulette",
    order: existingOrder,
    roulettePool: pool,
    rouletteSelectedId: selectedId,
    phaseStartedAt: now,
    phaseEndsAt: now + ROULETTE_MS,
    sharedClue: undefined,
  } satisfies GameState;
}

function finishRouletteSpin(
  state: GameState,
  users: RoomUser[],
  now: number,
  seed: string,
  config: RoomConfig,
) {
  const selectedId = state.rouletteSelectedId;
  const nextOrder = selectedId
    ? [...state.order.filter((id) => id !== selectedId), selectedId]
    : state.order;
  const nextPool = (state.roulettePool ?? [])
    .filter((id) => users.some((user) => user.id === id))
    .filter((id) => id !== selectedId);

  const finalOrder =
    nextPool.length === 1 ? [...nextOrder, nextPool[0]] : nextOrder;

  if (nextPool.length > 1) {
    return startRouletteSpin(
      {
        ...state,
        order: nextOrder,
        roulettePool: nextPool,
        rouletteSelectedId: undefined,
      },
      users,
      now,
      seed,
    );
  }

  return {
    ...state,
    phase: "turn",
    order: reconcileOrder(finalOrder, users, `${seed}:final`),
    roulettePool: undefined,
    rouletteSelectedId: undefined,
    currentTurnIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.clueSelectionTimeSeconds),
    sharedClue: undefined,
  } satisfies GameState;
}

function getClueDistribution(config = DEFAULT_ROOM_CONFIG) {
  const cluesPerPlayer = Math.min(
    10,
    Math.max(2, Math.round(config.cluesPerPlayer)),
  );
  const trueCluesPerPlayer = Math.min(
    cluesPerPlayer,
    Math.max(0, Math.round(config.trueCluesPerPlayer)),
  );

  return {
    cluesPerPlayer,
    trueCluesPerPlayer,
    falseCluesPerPlayer: cluesPerPlayer - trueCluesPerPlayer,
  };
}

function getPlayerTrueClueIds(userIndex: number, config: RoomConfig) {
  const distribution = getClueDistribution(config);

  return Array.from({ length: distribution.trueCluesPerPlayer }, (_, index) =>
    `true-${userIndex * distribution.trueCluesPerPlayer + index}`,
  );
}

function getSharedClueIds(state: GameState, userId: string) {
  return state.sharedClueIds?.[userId] ?? [];
}

function markClueShared(state: GameState, userId: string, clueId: string) {
  const existing = getSharedClueIds(state, userId);

  return {
    ...state.sharedClueIds,
    [userId]: existing.includes(clueId) ? existing : [...existing, clueId],
  };
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

async function getCaseTrueClues(caseId: string, client?: DatabaseClient) {
  const executor = client ?? { query: dbQuery };
  const result = await executor.query<{ true_clues: unknown }>(
    `SELECT true_clues FROM cases WHERE id = $1::uuid`,
    [caseId],
  );

  return normalizeTextArray(result.rows[0]?.true_clues);
}

async function buildAutoSharedClueState({
  state,
  users,
  caseId,
  config,
  now,
  client,
}: {
  state: GameState;
  users: RoomUser[];
  caseId: string | null;
  config: RoomConfig;
  now: number;
  client?: DatabaseClient;
}) {
  if (state.phase !== "turn" || state.pausedAt || !caseId) {
    return null;
  }

  const actorId = state.order[state.currentTurnIndex];
  const actor = users.find((user) => user.id === actorId);
  const actorIndex = users.findIndex((user) => user.id === actorId);

  if (!actor || actorIndex < 0) {
    return null;
  }

  const trueClues = await getCaseTrueClues(caseId, client);
  const trueClueIds = getPlayerTrueClueIds(actorIndex, config);

  if (!trueClues.length || !trueClueIds.length) {
    return null;
  }

  const usedIds = getSharedClueIds(state, actor.id);
  const clueId = trueClueIds.find((id) => !usedIds.includes(id)) ?? trueClueIds[0];
  const clueIndex = Number(clueId.split("-")[1] ?? 0);
  const clueText = trueClues[clueIndex % trueClues.length];

  if (!clueText) {
    return null;
  }

  return {
    ...state,
    phase: "shared_clue",
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.revealedClueAnalysisTimeSeconds),
    sharedClueIds: markClueShared(state, actor.id, clueId),
    sharedClue: {
      id: crypto.randomUUID(),
      actorId: actor.id,
      actorNickname: actor.nickname,
      clueText,
      clueNumber: trueClueIds.indexOf(clueId) + 1,
      clueId,
      autoShared: true,
      createdAt: now,
    },
  } satisfies GameState;
}

async function advanceGameStateWithAutoShare({
  state,
  users,
  now,
  seed,
  config,
  caseId,
  client,
}: {
  state: GameState;
  users: RoomUser[];
  now: number;
  seed: string;
  config: RoomConfig;
  caseId: string | null;
  client?: DatabaseClient;
}) {
  if (
    state.phase === "turn" &&
    !state.pausedAt &&
    now >= state.phaseEndsAt
  ) {
    const autoShared = await buildAutoSharedClueState({
      state,
      users,
      caseId,
      config,
      now,
      client,
    });

    if (autoShared) {
      return autoShared;
    }
  }

  return advanceGameState(state, users, now, seed, config);
}

function nextTurnOrPause(
  state: GameState,
  users: RoomUser[],
  now: number,
  config: RoomConfig,
) {
  if (state.currentTurnIndex + 1 >= state.order.length) {
    return {
      ...state,
      phase: "pause",
      phaseStartedAt: now,
      phaseEndsAt: now + durationMs(config.roundAnalysisTimeSeconds),
      sharedClue: undefined,
    } satisfies GameState;
  }

  return {
    ...state,
    phase: "turn",
    currentTurnIndex: state.currentTurnIndex + 1,
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.clueSelectionTimeSeconds),
    sharedClue: undefined,
    order: reconcileOrder(state.order, users, `${state.round}:turn`),
  } satisfies GameState;
}

function advanceGameState(
  state: GameState,
  users: RoomUser[],
  now: number,
  seed = "game",
  config = DEFAULT_ROOM_CONFIG,
) {
  const activeUsers = getActiveUsers(state, users);
  const activeUserIds = activeUsers.map((user) => user.id);
  const order =
    state.phase === "ready" || state.phase === "reading" || state.phase === "roulette"
      ? state.order.filter((id) => activeUserIds.includes(id))
      : reconcileOrder(state.order, activeUsers, `${state.round}:order`);
  let next = {
    ...state,
    order,
  };
  let guard = 0;

  if (next.pausedAt || next.phase === "ready") {
    return next;
  }

  while (now >= next.phaseEndsAt && guard < 20) {
    guard += 1;

    if (next.phase === "reading") {
      next = startRouletteSpin(next, activeUsers, now, seed);
    } else if (next.phase === "roulette") {
      next = finishRouletteSpin(next, activeUsers, now, seed, config);
    } else if (next.phase === "turn" || next.phase === "shared_clue") {
      next = nextTurnOrPause(next, activeUsers, now, config);
    } else {
      next = {
        ...next,
        phase: "turn",
        round: next.round + 1,
        currentTurnIndex: 0,
        phaseStartedAt: now,
        phaseEndsAt: now + durationMs(config.clueSelectionTimeSeconds),
        sharedClue: undefined,
      };
    }
  }

  return next;
}

function ensureColorAvailable({
  users,
  color,
  currentUserId,
}: {
  users: RoomUser[];
  color: PlayerColor;
  currentUserId?: string;
}) {
  const colorInUse = users.some(
    (user) => user.color === color && user.id !== currentUserId,
  );

  if (colorInUse) {
    throw new Error("Essa cor já está em uso na sala.");
  }
}

async function ensureSchema() {
  schemaReady ??= dbQuery(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS game_rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code text NOT NULL UNIQUE,
        activecase uuid,
        activeevent jsonb,
        gamestate jsonb,
        users jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        empty_since timestamptz
      );

      CREATE TABLE IF NOT EXISTS game_rooms_config (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid UNIQUE REFERENCES game_rooms(id) ON DELETE CASCADE,
        reading_time_seconds integer NOT NULL DEFAULT 120 CHECK (reading_time_seconds BETWEEN 0 AND 300),
        clue_selection_time_seconds integer NOT NULL DEFAULT 10 CHECK (clue_selection_time_seconds BETWEEN 5 AND 60),
        revealed_clue_analysis_time_seconds integer NOT NULL DEFAULT 30 CHECK (revealed_clue_analysis_time_seconds BETWEEN 10 AND 120),
        round_analysis_time_seconds integer NOT NULL DEFAULT 60 CHECK (round_analysis_time_seconds BETWEEN 0 AND 180),
        final_guess_time_seconds integer NOT NULL DEFAULT 30 CHECK (final_guess_time_seconds BETWEEN 20 AND 180),
        true_clues_per_player integer NOT NULL DEFAULT 3 CHECK (true_clues_per_player BETWEEN 0 AND 10),
        clues_per_player integer NOT NULL DEFAULT 6 CHECK (clues_per_player BETWEEN 2 AND 10),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE game_rooms
        ADD COLUMN IF NOT EXISTS room_code text,
        ADD COLUMN IF NOT EXISTS activecase uuid,
        ADD COLUMN IF NOT EXISTS activeevent jsonb,
        ADD COLUMN IF NOT EXISTS gamestate jsonb,
        ADD COLUMN IF NOT EXISTS users jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS empty_since timestamptz,
        ADD COLUMN IF NOT EXISTS config_id uuid;

      DO $
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'game_rooms_config_id_fkey'
        ) THEN
          ALTER TABLE game_rooms
            ADD CONSTRAINT game_rooms_config_id_fkey
            FOREIGN KEY (config_id) REFERENCES game_rooms_config(id) ON DELETE SET NULL;
        END IF;
      END $$;

      ALTER TABLE game_rooms_config
        ADD COLUMN IF NOT EXISTS reading_time_seconds integer NOT NULL DEFAULT 120 CHECK (reading_time_seconds BETWEEN 0 AND 300),
        ADD COLUMN IF NOT EXISTS clue_selection_time_seconds integer NOT NULL DEFAULT 10 CHECK (clue_selection_time_seconds BETWEEN 5 AND 60),
        ADD COLUMN IF NOT EXISTS revealed_clue_analysis_time_seconds integer NOT NULL DEFAULT 30 CHECK (revealed_clue_analysis_time_seconds BETWEEN 10 AND 120),
        ADD COLUMN IF NOT EXISTS round_analysis_time_seconds integer NOT NULL DEFAULT 60 CHECK (round_analysis_time_seconds BETWEEN 0 AND 180),
        ADD COLUMN IF NOT EXISTS final_guess_time_seconds integer NOT NULL DEFAULT 30 CHECK (final_guess_time_seconds BETWEEN 20 AND 180),
        ADD COLUMN IF NOT EXISTS true_clues_per_player integer NOT NULL DEFAULT 3 CHECK (true_clues_per_player BETWEEN 0 AND 10),
        ADD COLUMN IF NOT EXISTS clues_per_player integer NOT NULL DEFAULT 6 CHECK (clues_per_player BETWEEN 2 AND 10),
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

      UPDATE game_rooms_config
      SET final_guess_time_seconds = 20
      WHERE final_guess_time_seconds < 20;

      ALTER TABLE game_rooms_config
        DROP CONSTRAINT IF EXISTS game_rooms_config_final_guess_time_seconds_check,
        ADD CONSTRAINT game_rooms_config_final_guess_time_seconds_check
          CHECK (final_guess_time_seconds BETWEEN 20 AND 180);

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'game_rooms_config'
            AND column_name = 'true_clue_percentage'
        ) THEN
          UPDATE game_rooms_config
          SET true_clues_per_player = LEAST(
            clues_per_player,
            GREATEST(0, ROUND((clues_per_player * true_clue_percentage) / 100.0)::integer)
          )
          WHERE true_clues_per_player = 3;
        END IF;
      END $$;

      INSERT INTO game_rooms_config (room_id)
      SELECT gr.id
      FROM game_rooms gr
      LEFT JOIN game_rooms_config cfg ON cfg.room_id = gr.id
      WHERE cfg.id IS NULL;

      UPDATE game_rooms gr
      SET config_id = cfg.id
      FROM game_rooms_config cfg
      WHERE cfg.room_id = gr.id
        AND gr.config_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS game_rooms_room_code_key
        ON game_rooms (room_code);

      CREATE INDEX IF NOT EXISTS game_rooms_empty_since_idx
        ON game_rooms (empty_since)
        WHERE empty_since IS NOT NULL;
    `)
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null;
      throw error;
    });

  return schemaReady;
}

async function cleanupExpiredRooms(client?: DatabaseClient) {
  const sql = `
    DELETE FROM game_rooms
    WHERE empty_since IS NOT NULL
      AND empty_since <= now() - $1::interval
  `;
  const values = [ROOM_EMPTY_TTL_SQL];

  if (client) {
    await client.query(sql, values);
    return;
  }

  await dbQuery(sql, values);
}

export async function createRoom() {
  await ensureSchema();
  await cleanupExpiredRooms();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const client = await getDbClient();

    try {
      await client.query("BEGIN");

      const result = await client.query<Room & { id: string }>(
        `
          INSERT INTO game_rooms (room_code, users, empty_since, activecase)
          VALUES ($1, '[]'::jsonb, now(), NULL)
          ON CONFLICT DO NOTHING
          RETURNING id::text AS id, room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
        `,
        [code],
      );
      const room = result.rows[0];

      if (!room) {
        await client.query("ROLLBACK");
        continue;
      }

      const configResult = await client.query<RoomConfig & { id: string }>(
        `
          INSERT INTO game_rooms_config (room_id)
          VALUES ($1::uuid)
          RETURNING
            id::text AS id,
            reading_time_seconds AS "readingTimeSeconds",
            clue_selection_time_seconds AS "clueSelectionTimeSeconds",
            revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
            round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
            final_guess_time_seconds AS "finalGuessTimeSeconds",
            true_clues_per_player AS "trueCluesPerPlayer",
            clues_per_player AS "cluesPerPlayer"
        `,
        [room.id],
      );
      const config = normalizeRoomConfig(configResult.rows[0]);

      await client.query(
        `UPDATE game_rooms SET config_id = $2::uuid WHERE id = $1::uuid`,
        [room.id, configResult.rows[0].id],
      );
      await client.query("COMMIT");

      return publicRoom({
        code: room.code,
        users: normalizeUsers(room.users),
        activecase: room.activecase,
        activeevent: room.activeevent,
        gamestate: normalizeGameState(room.gamestate),
        config,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Não foi possível criar uma sala agora.");
}

export async function getRoom(code: string) {
  await ensureSchema();
  await cleanupExpiredRooms();

  const result = await dbQuery<Room>(
    `
      SELECT
        gr.room_code AS code,
        gr.users,
        gr.activecase::text AS activecase,
        gr.activeevent,
        gr.gamestate,
        cfg.reading_time_seconds AS "readingTimeSeconds",
        cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
        cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
        cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
        cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
        cfg.true_clues_per_player AS "trueCluesPerPlayer",
        cfg.clues_per_player AS "cluesPerPlayer"
      FROM game_rooms gr
      LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
      WHERE gr.room_code = $1
    `,
    [code],
  );
  const room = result.rows[0];

  if (!room) {
    return null;
  }

  const users = normalizeUsers(room.users);
  const config = normalizeRoomConfig(room);
  const baseRoom = {
    code: room.code,
    users,
    activecase: room.activecase,
    activeevent: room.activeevent,
    gamestate: normalizeGameState(room.gamestate),
    config,
  };
  const now = Date.now();
  const nextState = baseRoom.gamestate
    ? await advanceGameStateWithAutoShare({
        state: baseRoom.gamestate,
        users,
        now,
        seed: `${code}:${baseRoom.activecase ?? "case"}`,
        config,
        caseId: baseRoom.activecase,
      })
    : initialGameState(baseRoom, now);

  if (JSON.stringify(nextState) !== JSON.stringify(baseRoom.gamestate)) {
    await dbQuery(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, nextState ? JSON.stringify(nextState) : null],
    );
  }

  return publicRoom({
    ...baseRoom,
    gamestate: nextState,
  });
}

export async function joinRoom({
  code,
  nickname,
  color,
}: {
  code: string;
  nickname: string;
  color: string;
}) {
  await ensureSchema();

  const trimmedNickname = nickname.trim().slice(0, 18);
  const normalizedColor = color.trim();

  if (!trimmedNickname || !isPlayerColor(normalizedColor)) {
    throw new Error("Dados de usuário inválidos.");
  }

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    ensureColorAvailable({ users, color: normalizedColor });

    const user: RoomUser = {
      id: crypto.randomUUID(),
      nickname: trimmedNickname,
      color: normalizedColor,
      ready: false,
      joinedAt: Date.now(),
    };
    const updatedUsers = [...users, user];

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            empty_since = NULL,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return {
      room: publicRoom({
        code,
        users: updatedUsers,
        activecase: room.activecase,
        activeevent: room.activeevent,
        gamestate: normalizeGameState(room.gamestate),
      }),
      user,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function leaveRoom({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const updatedUsers = normalizeUsers(room.users).filter(
      (user) => user.id !== userId,
    );

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            empty_since = CASE
              WHEN jsonb_array_length($2::jsonb) = 0 THEN COALESCE(empty_since, now())
              ELSE NULL
            END,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      users: updatedUsers,
      activecase: room.activecase,
      activeevent: room.activeevent,
      gamestate: normalizeGameState(room.gamestate),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRoomUser({
  code,
  userId,
  nickname,
  color,
}: {
  code: string;
  userId: string;
  nickname: string;
  color: string;
}) {
  await ensureSchema();

  const trimmedNickname = nickname.trim().slice(0, 18);
  const normalizedColor = color.trim();

  if (!trimmedNickname || !isPlayerColor(normalizedColor)) {
    throw new Error("Dados de usuário inválidos.");
  }

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    ensureColorAvailable({
      users,
      color: normalizedColor,
      currentUserId: userId,
    });

    let updatedUser: RoomUser | null = null;
    const updatedUsers = users.map((user) => {
      if (user.id !== userId) {
        return user;
      }

      updatedUser = {
        ...user,
        nickname: trimmedNickname,
        color: normalizedColor,
        ready: false,
      };

      return updatedUser;
    });

    if (!updatedUser) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return {
      room: publicRoom({
        code,
        users: updatedUsers,
        activecase: room.activecase,
        activeevent: room.activeevent,
        gamestate: normalizeGameState(room.gamestate),
      }),
      user: updatedUser,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRoomConfig({
  code,
  userId,
  config,
}: {
  code: string;
  userId: string;
  config: Partial<RoomConfig>;
}) {
  await ensureSchema();

  const nextConfig = normalizeRoomConfig(config);
  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room & { config_id: string | null }>(
      `
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate, config_id::text AS config_id
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    if (room.activecase) {
      await client.query("ROLLBACK");
      throw new Error("A configuração não pode ser alterada com dossiê ativo.");
    }

    const users = normalizeUsers(room.users);
    const firstUser = users[0];

    if (!firstUser || firstUser.id !== userId) {
      await client.query("ROLLBACK");
      throw new Error("Apenas o primeiro participante pode alterar a configuração.");
    }

    let configId = room.config_id;

    if (!configId) {
      const configResult = await client.query<{ id: string }>(
        `
          INSERT INTO game_rooms_config (room_id)
          SELECT id FROM game_rooms WHERE room_code = $1
          ON CONFLICT (room_id) DO UPDATE SET updated_at = now()
          RETURNING id::text AS id
        `,
        [code],
      );
      configId = configResult.rows[0].id;
      await client.query(
        `UPDATE game_rooms SET config_id = $2::uuid WHERE room_code = $1`,
        [code, configId],
      );
    }

    const updatedUsers = users.map((user) => ({ ...user, ready: false }));

    await client.query(
      `
        UPDATE game_rooms_config
        SET reading_time_seconds = $2,
            clue_selection_time_seconds = $3,
            revealed_clue_analysis_time_seconds = $4,
            round_analysis_time_seconds = $5,
            final_guess_time_seconds = $6,
            true_clues_per_player = $7,
            clues_per_player = $8,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [
        configId,
        nextConfig.readingTimeSeconds,
        nextConfig.clueSelectionTimeSeconds,
        nextConfig.revealedClueAnalysisTimeSeconds,
        nextConfig.roundAnalysisTimeSeconds,
        nextConfig.finalGuessTimeSeconds,
        nextConfig.trueCluesPerPlayer,
        nextConfig.cluesPerPlayer,
      ],
    );

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      users: updatedUsers,
      activecase: room.activecase,
      activeevent: room.activeevent,
      gamestate: normalizeGameState(room.gamestate),
      config: nextConfig,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setRoomUserReady({
  code,
  userId,
  ready,
}: {
  code: string;
  userId: string;
  ready: boolean;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    let userExists = false;
    const updatedUsers = normalizeUsers(room.users).map((user) => {
      if (user.id !== userId) {
        return user;
      }

      userExists = true;
      return {
        ...user,
        ready,
      };
    });

    if (!userExists) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      users: updatedUsers,
      activecase: room.activecase,
      activeevent: room.activeevent,
      gamestate: normalizeGameState(room.gamestate),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setRoomActiveCase({
  code,
  caseId,
}: {
  code: string;
  caseId: string;
}) {
  await ensureSchema();

  const result = await dbQuery(
    `
      UPDATE game_rooms
      SET activecase = $2::uuid,
          updated_at = now()
      WHERE room_code = $1
        AND activecase IS NULL
      RETURNING room_code
    `,
    [code, caseId],
  );

  return result.rowCount === 1;
}

async function getCaseFinalAnswer(caseId: string, client: DatabaseClient) {
  const result = await client.query<{ final_answer: string }>(
    `SELECT final_answer FROM cases WHERE id = $1::uuid`,
    [caseId],
  );

  return result.rows[0]?.final_answer ?? "";
}

async function evaluateFinalGuess({
  guess,
  finalAnswer,
}: {
  guess: string;
  finalAnswer: string;
}) {
  const normalizedGuess = guess.trim();

  if (!normalizedGuess) {
    return false;
  }

  const response = await chatCompletion({
    temperature: 0,
    maxTokens: 8,
    validateText: (text) => {
      const normalized = text.trim().toLowerCase();

      if (normalized !== "true" && normalized !== "false") {
        throw new Error(`A IA respondeu avaliação inválida: ${text.slice(0, 40)}`);
      }
    },
    messages: [
      {
        role: "system",
        content:
          'Você é um juiz estrito de respostas de jogo investigativo. Responda exclusivamente true ou false. Aceite sinônimos, erros ortográficos e formulações diferentes quando a ideia central estiver correta. Não explique.',
      },
      {
        role: "user",
        content: `Resposta oficial:
${finalAnswer}

Palpite do jogador:
${normalizedGuess}

O palpite resolve corretamente as perguntas centrais do caso?`,
      },
    ],
  });

  return response.text.trim().toLowerCase() === "true";
}

export async function publishRoomEvent({
  code,
  userId,
  event,
}: {
  code: string;
  userId: string;
  event:
    | { type: "solution" }
    | { type: "solution_guess"; guess: string };
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room>(
      `
        SELECT
          gr.room_code AS code,
          gr.users,
          gr.activecase::text AS activecase,
          gr.activeevent,
          gr.gamestate,
          cfg.reading_time_seconds AS "readingTimeSeconds",
          cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
          cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
          cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
          cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
          cfg.true_clues_per_player AS "trueCluesPerPlayer",
          cfg.clues_per_player AS "cluesPerPlayer"
        FROM game_rooms gr
        LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
        WHERE gr.room_code = $1
        FOR UPDATE OF gr
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const actor = normalizeUsers(room.users).find((user) => user.id === userId);

    if (!actor) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    const currentState = normalizeGameState(room.gamestate);
    const now = Date.now();

    if (!currentState) {
      await client.query("ROLLBACK");
      throw new Error("Jogo ainda não foi iniciado.");
    }

    let activeevent: RoomEvent;
    let resumedState: GameState | null = currentState;

    if (event.type === "solution") {
      activeevent = {
        id: crypto.randomUUID(),
        type: "solution",
        actorId: actor.id,
        actorNickname: actor.nickname,
        createdAt: now,
      };
      resumedState = currentState.pausedAt
        ? currentState
        : {
            ...currentState,
            pausedAt: now,
            pausedRemainingMs: Math.max(0, currentState.phaseEndsAt - now),
          };
    } else {
      if (!room.activecase) {
        await client.query("ROLLBACK");
        throw new Error("Caso ativo não encontrado.");
      }

      const finalAnswer = await getCaseFinalAnswer(room.activecase, client);
      const isCorrect = await evaluateFinalGuess({
        guess: event.guess,
        finalAnswer,
      });

      activeevent = {
        id: crypto.randomUUID(),
        type: isCorrect ? "solution_correct" : "solution_wrong",
        actorId: actor.id,
        actorNickname: actor.nickname,
        guess: event.guess.trim(),
        createdAt: now,
      };

      if (isCorrect) {
        resumedState = currentState;
      } else {
        const eliminatedState = {
          ...currentState,
          eliminatedUserIds: addEliminatedUser(currentState, actor.id),
        };
        const activeUsers = getActiveUsers(eliminatedState, normalizeUsers(room.users));
        const nextOrder = reconcileOrder(
          eliminatedState.order,
          activeUsers,
          `${code}:eliminated`,
        );
        const previousTurnUserId = currentState.order[currentState.currentTurnIndex];
        const preservedTurnIndex = nextOrder.indexOf(previousTurnUserId);
        const nextTurnIndex =
          preservedTurnIndex >= 0
            ? preservedTurnIndex
            : Math.min(currentState.currentTurnIndex, Math.max(0, nextOrder.length - 1));

        resumedState = {
          ...eliminatedState,
          order: nextOrder,
          currentTurnIndex: nextTurnIndex,
          pausedAt: undefined,
          pausedRemainingMs: undefined,
          phaseStartedAt: now,
          phaseEndsAt:
            now +
            (currentState.pausedRemainingMs ??
              durationMs(normalizeRoomConfig(room).clueSelectionTimeSeconds)),
        };
      }
    }

    await client.query(
      `
        UPDATE game_rooms
        SET activeevent = $2::jsonb,
            gamestate = $3::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(activeevent), JSON.stringify(resumedState)],
    );

    await client.query("COMMIT");

    return activeevent;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getLockedRoomWithConfig(client: DatabaseClient, code: string) {
  return client.query<Room>(
    `
      SELECT
        gr.room_code AS code,
        gr.users,
        gr.activecase::text AS activecase,
        gr.activeevent,
        gr.gamestate,
        cfg.reading_time_seconds AS "readingTimeSeconds",
        cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
        cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
        cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
        cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
        cfg.true_clues_per_player AS "trueCluesPerPlayer",
        cfg.clues_per_player AS "cluesPerPlayer"
      FROM game_rooms gr
      LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
      WHERE gr.room_code = $1
      FOR UPDATE OF gr
    `,
    [code],
  );
}

export async function setGameUserReady({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await getLockedRoomWithConfig(client, code);
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const user = users.find((item) => item.id === userId);

    if (!user) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    const config = normalizeRoomConfig(room);
    const now = Date.now();
    const state =
      normalizeGameState(room.gamestate) ??
      initialGameState(
        {
          code,
          users,
          activecase: room.activecase,
          activeevent: room.activeevent,
          gamestate: null,
        },
        now,
      );

    if (!state) {
      await client.query("ROLLBACK");
      throw new Error("Jogo ainda não foi iniciado.");
    }

    if (state.phase !== "ready") {
      await client.query("ROLLBACK");
      return state;
    }

    const readyUserIds = Array.from(
      new Set([...(state.readyUserIds ?? []), user.id]),
    );
    const nextState = areAllUsersReady(
      users.map((item) => item.id),
      readyUserIds,
    )
      ? startReadingPhase({ ...state, readyUserIds }, now, config)
      : { ...state, readyUserIds };

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(nextState)],
    );

    await client.query("COMMIT");

    return nextState;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function skipGamePhase({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await getLockedRoomWithConfig(client, code);
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const user = users.find((item) => item.id === userId);

    if (!user) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    const state = normalizeGameState(room.gamestate);
    const config = normalizeRoomConfig(room);
    const now = Date.now();

    if (
      !state ||
      state.pausedAt ||
      (state.phase !== "reading" &&
        state.phase !== "pause" &&
        state.phase !== "shared_clue")
    ) {
      await client.query("ROLLBACK");
      throw new Error("Esta fase não pode ser pulada agora.");
    }

    const phaseKey = phaseSkipKey(state);
    const currentVotes =
      state.skipVotes?.phaseKey === phaseKey ? state.skipVotes.userIds : [];
    const userIds = users.map((item) => item.id);
    const nextVotes = Array.from(new Set([...currentVotes, user.id]));
    const votedState = {
      ...state,
      skipVotes: { phaseKey, userIds: nextVotes },
    } satisfies GameState;
    const nextState = areAllUsersReady(userIds, nextVotes)
      ? await advanceGameStateWithAutoShare({
          state: { ...votedState, phaseEndsAt: now, skipVotes: undefined },
          users,
          now,
          seed: `${code}:${room.activecase ?? "case"}`,
          config,
          caseId: room.activecase,
          client,
        })
      : votedState;

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(nextState)],
    );

    await client.query("COMMIT");

    return nextState;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function shareRoomClue({
  code,
  userId,
  clueText,
  clueNumber,
  clueId,
}: {
  code: string;
  userId: string;
  clueText: string;
  clueNumber: number;
  clueId?: string;
}) {
  await ensureSchema();

  const trimmedClue = clueText.trim();

  if (!trimmedClue) {
    throw new Error("Pista inválida.");
  }

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room>(
      `
        SELECT
          gr.room_code AS code,
          gr.users,
          gr.activecase::text AS activecase,
          gr.activeevent,
          gr.gamestate,
          cfg.reading_time_seconds AS "readingTimeSeconds",
          cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
          cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
          cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
          cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
          cfg.true_clues_per_player AS "trueCluesPerPlayer",
          cfg.clues_per_player AS "cluesPerPlayer"
        FROM game_rooms gr
        LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
        WHERE gr.room_code = $1
        FOR UPDATE OF gr
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const actor = users.find((user) => user.id === userId);

    if (!actor) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    const state = normalizeGameState(room.gamestate);
    const now = Date.now();
    const config = normalizeRoomConfig(room);
    const nextState = state
      ? await advanceGameStateWithAutoShare({
          state,
          users,
          now,
          seed: `${code}:${room.activecase ?? "case"}`,
          config,
          caseId: room.activecase,
          client,
        })
      : initialGameState(
          {
            code,
            users,
            activecase: room.activecase,
            activeevent: room.activeevent,
            gamestate: null,
          },
          now,
        );

    if (
      !nextState ||
      nextState.phase !== "turn" ||
      nextState.order[nextState.currentTurnIndex] !== actor.id ||
      nextState.pausedAt
    ) {
      await client.query("ROLLBACK");
      throw new Error("Não é a vez desse jogador compartilhar uma pista.");
    }

    const distribution = getClueDistribution(config);
    const allPlayerClueCount = distribution.cluesPerPlayer;
    const safeClueId = clueId?.trim() || `manual-${clueNumber}`;
    const alreadySharedIds = getSharedClueIds(nextState, actor.id);

    if (
      alreadySharedIds.includes(safeClueId) &&
      alreadySharedIds.length < allPlayerClueCount
    ) {
      await client.query("ROLLBACK");
      throw new Error("Essa pista já foi compartilhada. Escolha uma pista diferente.");
    }

    const sharedState: GameState = {
      ...nextState,
      phase: "shared_clue",
      phaseStartedAt: now,
      phaseEndsAt: now + durationMs(config.revealedClueAnalysisTimeSeconds),
      sharedClueIds: markClueShared(nextState, actor.id, safeClueId),
      sharedClue: {
        id: crypto.randomUUID(),
        actorId: actor.id,
        actorNickname: actor.nickname,
        clueText: trimmedClue,
        clueNumber,
        clueId: safeClueId,
        createdAt: now,
      },
    };

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(sharedState)],
    );

    await client.query("COMMIT");

    return sharedState;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function returnRoomCaseToLobby({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const returningUser = users.find((user) => user.id === userId);

    if (!returningUser) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    const state =
      normalizeGameState(room.gamestate) ??
      initialGameState(
        {
          ...room,
          users,
          activeevent: room.activeevent,
          gamestate: null,
        },
        Date.now(),
      );
    const returnedToLobbyUserIds = Array.from(
      new Set([...(state?.returnedToLobbyUserIds ?? []), userId]),
    );
    const everyoneReturned =
      users.length > 0 && users.every((user) => returnedToLobbyUserIds.includes(user.id));

    if (everyoneReturned) {
      const resetUsers = users.map((user) => ({
        ...user,
        ready: false,
      }));

      await client.query(
        `
          UPDATE game_rooms
          SET activecase = NULL,
              activeevent = NULL,
              gamestate = NULL,
              users = $2::jsonb,
              updated_at = now()
          WHERE room_code = $1
        `,
        [code, JSON.stringify(resetUsers)],
      );

      await client.query("COMMIT");

      return publicRoom({
        code,
        users: resetUsers,
        activecase: null,
        activeevent: null,
        gamestate: null,
      });
    }

    const nextState = state
      ? {
          ...state,
          returnedToLobbyUserIds,
        }
      : null;

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(nextState)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      users,
      activecase: room.activecase,
      activeevent: room.activeevent,
      gamestate: nextState,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function finishRoomCase({ code }: { code: string }) {
  await ensureSchema();

  const current = await dbQuery<Room>(
    `
      SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
      FROM game_rooms
      WHERE room_code = $1
    `,
    [code],
  );
  const room = current.rows[0];

  if (!room) {
    return null;
  }

  const users = normalizeUsers(room.users).map((user) => ({
    ...user,
    ready: false,
  }));

  await dbQuery(
    `
      UPDATE game_rooms
      SET activecase = NULL,
          activeevent = NULL,
          gamestate = NULL,
          users = $2::jsonb,
          updated_at = now()
      WHERE room_code = $1
    `,
    [code, JSON.stringify(users)],
  );

  return publicRoom({
    code,
    users,
    activecase: null,
    activeevent: null,
    gamestate: null,
  });
}
