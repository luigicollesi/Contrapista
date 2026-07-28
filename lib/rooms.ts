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
};

export type RoomEvent =
  | {
      id: string;
      type: "clue";
      actorId: string;
      actorNickname: string;
      clueKey: string;
      locationName: string;
      createdAt: number;
    }
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
    };

const ROOM_EMPTY_TTL_SQL = "1 hour";

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
    allReady: room.users.length > 0 && room.users.every((user) => user.ready),
  };
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
        users jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        empty_since timestamptz
      );

      ALTER TABLE game_rooms
        ADD COLUMN IF NOT EXISTS room_code text,
        ADD COLUMN IF NOT EXISTS activecase uuid,
        ADD COLUMN IF NOT EXISTS activeevent jsonb,
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
        RETURNING room_code AS code, users, activecase::text AS activecase, activeevent
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
      SELECT room_code AS code, users, activecase::text AS activecase, activeevent
      FROM game_rooms
      WHERE room_code = $1
    `,
    [code],
  );
  const room = result.rows[0];

  return room
    ? publicRoom({
        code: room.code,
        users: normalizeUsers(room.users),
        activecase: room.activecase,
        activeevent: room.activeevent,
      })
    : null;
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
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent
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
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent
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
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent
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
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent
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
    | { type: "clue"; clueKey: string; locationName: string }
    | { type: "solution" }
    | { type: "solution_correct" };
}) {
  await ensureSchema();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await cleanupExpiredRooms(client);

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, users, activecase::text AS activecase, activeevent
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

    const activeevent: RoomEvent =
      event.type === "clue"
        ? {
            id: crypto.randomUUID(),
            type: "clue",
            actorId: actor.id,
            actorNickname: actor.nickname,
            clueKey: event.clueKey,
            locationName: event.locationName,
            createdAt: Date.now(),
          }
        : {
            id: crypto.randomUUID(),
            type: event.type,
            actorId: actor.id,
            actorNickname: actor.nickname,
            createdAt: Date.now(),
          };

    await client.query(
      `
        UPDATE game_rooms
        SET activeevent = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(activeevent)],
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

export async function finishRoomCase({ code }: { code: string }) {
  await ensureSchema();

  const current = await pool.query<Room>(
    `
      SELECT room_code AS code, users, activecase::text AS activecase, activeevent
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
  });
}
