import type { PoolClient } from "pg";
import { pool } from "@/lib/db";
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

export type Room = {
  code: string;
  users: RoomUser[];
  activecase: string | null;
  activeevent: RoomEvent | null;
  gamestate: GameState | null;
};

export type RoomEvent =
  | {
      id: string;
      type: "solution";
      actorId: string;
      actorNickname: string;
      createdAt: number;
    }
  | {
      id: string;
      type: "solution_correct";
      actorId: string;
      actorNickname: string;
      createdAt: number;
    }
  | {
      id: string;
      type: "solution_wrong";
      actorId: string;
      actorNickname: string;
      createdAt: number;
    };

export type GameState = {
  phase: "reading" | "roulette" | "turn" | "shared_clue" | "pause";
  round: number;
  order: string[];
  currentTurnIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  roulettePool?: string[];
  rouletteSelectedId?: string;
  pausedAt?: number;
  pausedRemainingMs?: number;
  sharedClue?: {
    id: string;
    actorId: string;
    actorNickname: string;
    clueText: string;
    clueNumber: number;
    createdAt: number;
  };
};

const ROOM_EMPTY_TTL_SQL = "1 hour";
const READING_MS = 120_000;
const ROULETTE_MS = 3_000;
const TURN_MS = 10_000;
const SHARED_CLUE_MS = 30_000;
const PAUSE_MS = 60_000;

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

function publicRoom(room: Room) {
  return {
    code: room.code,
    users: room.users,
    userCount: room.users.length,
    activecase: room.activecase,
    activeevent: room.activeevent,
    gamestate: room.gamestate,
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
    phase: "reading",
    round: 1,
    order: [],
    currentTurnIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + READING_MS,
  };
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
) {
  const selectedId = state.rouletteSelectedId;
  const nextOrder = selectedId
    ? [...state.order.filter((id) => id !== selectedId), selectedId]
    : state.order;
  const nextPool = (state.roulettePool ?? [])
    .filter((id) => users.some((user) => user.id === id))
    .filter((id) => id !== selectedId);

  if (nextPool.length > 0) {
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
    order: reconcileOrder(nextOrder, users, `${seed}:final`),
    roulettePool: undefined,
    rouletteSelectedId: undefined,
    currentTurnIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + TURN_MS,
    sharedClue: undefined,
  } satisfies GameState;
}

function nextTurnOrPause(state: GameState, users: RoomUser[], now: number) {
  if (state.currentTurnIndex + 1 >= state.order.length) {
    return {
      ...state,
      phase: "pause",
      phaseStartedAt: now,
      phaseEndsAt: now + PAUSE_MS,
      sharedClue: undefined,
    } satisfies GameState;
  }

  return {
    ...state,
    phase: "turn",
    currentTurnIndex: state.currentTurnIndex + 1,
    phaseStartedAt: now,
    phaseEndsAt: now + TURN_MS,
    sharedClue: undefined,
    order: reconcileOrder(state.order, users, `${state.round}:turn`),
  } satisfies GameState;
}

function advanceGameState(
  state: GameState,
  users: RoomUser[],
  now: number,
  seed = "game",
) {
  let next = {
    ...state,
    order: reconcileOrder(state.order, users, `${state.round}:order`),
  };
  let guard = 0;

  if (next.pausedAt) {
    return next;
  }

  while (now >= next.phaseEndsAt && guard < 20) {
    guard += 1;

    if (next.phase === "reading") {
      next = startRouletteSpin(next, users, now, seed);
    } else if (next.phase === "roulette") {
      next = finishRouletteSpin(next, users, now, seed);
    } else if (next.phase === "turn" || next.phase === "shared_clue") {
      next = nextTurnOrPause(next, users, now);
    } else {
      next = {
        ...next,
        phase: "turn",
        round: next.round + 1,
        currentTurnIndex: 0,
        phaseStartedAt: now,
        phaseEndsAt: now + TURN_MS,
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
  schemaReady ??= pool
    .query(`
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

      ALTER TABLE game_rooms
        ADD COLUMN IF NOT EXISTS room_code text,
        ADD COLUMN IF NOT EXISTS activecase uuid,
        ADD COLUMN IF NOT EXISTS activeevent jsonb,
        ADD COLUMN IF NOT EXISTS gamestate jsonb,
        ADD COLUMN IF NOT EXISTS users jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS empty_since timestamptz;

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

async function cleanupExpiredRooms(client?: PoolClient) {
  const executor = client ?? pool;

  await executor.query(
    `
      DELETE FROM game_rooms
      WHERE empty_since IS NOT NULL
        AND empty_since <= now() - $1::interval
    `,
    [ROOM_EMPTY_TTL_SQL],
  );
}

export async function createRoom() {
  await ensureSchema();
  await cleanupExpiredRooms();

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const result = await pool.query<Room>(
      `
        INSERT INTO game_rooms (room_code, users, empty_since, activecase)
        VALUES ($1, '[]'::jsonb, now(), NULL)
        ON CONFLICT DO NOTHING
        RETURNING room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
      `,
      [code],
    );

    const room = result.rows[0];

    if (room) {
      return publicRoom({
        code: room.code,
        users: normalizeUsers(room.users),
        activecase: room.activecase,
        activeevent: room.activeevent,
        gamestate: normalizeGameState(room.gamestate),
      });
    }
  }

  throw new Error("Não foi possível criar uma sala agora.");
}

export async function getRoom(code: string) {
  await ensureSchema();
  await cleanupExpiredRooms();

  const result = await pool.query<Room>(
    `
      SELECT room_code AS code, users, activecase::text AS activecase, activeevent, gamestate
      FROM game_rooms
      WHERE room_code = $1
    `,
    [code],
  );
  const room = result.rows[0];

  if (!room) {
    return null;
  }

  const users = normalizeUsers(room.users);
  const baseRoom = {
    code: room.code,
    users,
    activecase: room.activecase,
    activeevent: room.activeevent,
    gamestate: normalizeGameState(room.gamestate),
  };
  const now = Date.now();
  const nextState = baseRoom.gamestate
    ? advanceGameState(
        baseRoom.gamestate,
        users,
        now,
        `${code}:${baseRoom.activecase ?? "case"}`,
      )
    : initialGameState(baseRoom, now);

  if (JSON.stringify(nextState) !== JSON.stringify(baseRoom.gamestate)) {
    await pool.query(
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

  const client = await pool.connect();

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

  const client = await pool.connect();

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

  const client = await pool.connect();

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

  const client = await pool.connect();

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

  const result = await pool.query(
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

export async function publishRoomEvent({
  code,
  userId,
  event,
}: {
  code: string;
  userId: string;
  event:
    | { type: "solution" }
    | { type: "solution_correct" }
    | { type: "solution_wrong" };
}) {
  await ensureSchema();

  const client = await pool.connect();

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

    const actor = normalizeUsers(room.users).find((user) => user.id === userId);

    if (!actor) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    const activeevent: RoomEvent = {
      id: crypto.randomUUID(),
      type: event.type,
      actorId: actor.id,
      actorNickname: actor.nickname,
      createdAt: Date.now(),
    };
    const currentState = normalizeGameState(room.gamestate);
    const now = Date.now();
    const pausedState =
      event.type === "solution" && currentState && !currentState.pausedAt
        ? {
            ...currentState,
            pausedAt: now,
            pausedRemainingMs: Math.max(0, currentState.phaseEndsAt - now),
          }
        : currentState;
    const resumedState =
      event.type === "solution_wrong" && currentState?.pausedAt
        ? {
            ...currentState,
            pausedAt: undefined,
            pausedRemainingMs: undefined,
            phaseStartedAt: now,
            phaseEndsAt: now + (currentState.pausedRemainingMs ?? TURN_MS),
          }
        : pausedState;

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

export async function shareRoomClue({
  code,
  userId,
  clueText,
  clueNumber,
}: {
  code: string;
  userId: string;
  clueText: string;
  clueNumber: number;
}) {
  await ensureSchema();

  const trimmedClue = clueText.trim();

  if (!trimmedClue) {
    throw new Error("Pista inválida.");
  }

  const client = await pool.connect();

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
    const actor = users.find((user) => user.id === userId);

    if (!actor) {
      await client.query("ROLLBACK");
      throw new Error("Usuário não encontrado na sala.");
    }

    const state = normalizeGameState(room.gamestate);
    const now = Date.now();
    const nextState = state
      ? advanceGameState(state, users, now, `${code}:${room.activecase ?? "case"}`)
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

    const sharedState: GameState = {
      ...nextState,
      phase: "shared_clue",
      phaseStartedAt: now,
      phaseEndsAt: now + SHARED_CLUE_MS,
      sharedClue: {
        id: crypto.randomUUID(),
        actorId: actor.id,
        actorNickname: actor.nickname,
        clueText: trimmedClue,
        clueNumber,
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

export async function finishRoomCase({ code }: { code: string }) {
  await ensureSchema();

  const current = await pool.query<Room>(
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

  await pool.query(
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
