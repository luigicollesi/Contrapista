import "server-only";

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { dbQuery } from "@/lib/db";

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;
export const AUTH_PROVIDERS = ["credentials", "google", "github"] as const;
export const CURRENT_TERMS_VERSION = "2026-08-02";
export const CURRENT_PRIVACY_VERSION = "2026-08-02";

export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export type AuthUser = {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  provider: AuthProvider;
  password_hash: string | null;
  privacy_acknowledged: boolean;
  privacy_acknowledged_at: string | null;
  privacy_version: string | null;
  terms_accepted: boolean;
  terms_accepted_at: string | null;
  terms_version: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PublicAuthUser = Pick<
  AuthUser,
  "id" | "email" | "provider" | "username"
> & {
  name: string | null;
  needsUsername: boolean;
};

export type UserAchievements = {
  user_id: string;
  total_matches_played: number;
  ranked_matches_played: number;
  total_matches_won: number;
  ranked_matches_won: number;
  ranked_rating: number;
  daily_problems_solved: number;
  created_at?: string;
  updated_at?: string;
};

export async function ensureUsersSchema() {
  await dbQuery(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (char_length(btrim(name)) >= 2),
      email text NOT NULL,
      email_normalized text GENERATED ALWAYS AS (lower(btrim(email))) STORED,
      password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
      provider text NOT NULL DEFAULT 'credentials',
      username text,
      privacy_acknowledged boolean NOT NULL DEFAULT false,
      privacy_acknowledged_at timestamptz,
      privacy_version text,
      terms_accepted boolean NOT NULL DEFAULT false,
      terms_accepted_at timestamptz,
      terms_version text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT users_email_normalized_unique UNIQUE (email_normalized)
    );

    ALTER TABLE users
      ALTER COLUMN name DROP NOT NULL,
      ALTER COLUMN password_hash DROP NOT NULL;

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'credentials',
      ADD COLUMN IF NOT EXISTS username text,
      ADD COLUMN IF NOT EXISTS privacy_acknowledged boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS privacy_acknowledged_at timestamptz,
      ADD COLUMN IF NOT EXISTS privacy_version text,
      ADD COLUMN IF NOT EXISTS terms_accepted boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
      ADD COLUMN IF NOT EXISTS terms_version text;

    UPDATE users
    SET terms_accepted = true
    WHERE terms_accepted = false
      AND terms_accepted_at IS NOT NULL;

    UPDATE users
    SET
      privacy_acknowledged = true,
      privacy_acknowledged_at = COALESCE(privacy_acknowledged_at, terms_accepted_at, now()),
      privacy_version = COALESCE(privacy_version, '${CURRENT_PRIVACY_VERSION}')
    WHERE privacy_acknowledged = false
      AND terms_accepted = true;

    UPDATE users
    SET username = name
    WHERE username IS NULL
      AND name IS NOT NULL
      AND btrim(name) <> '';

    CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_unique
      ON users (lower(btrim(username)))
      WHERE username IS NOT NULL;

    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      total_matches_played integer NOT NULL DEFAULT 0,
      ranked_matches_played integer NOT NULL DEFAULT 0,
      total_matches_won integer NOT NULL DEFAULT 0,
      ranked_matches_won integer NOT NULL DEFAULT 0,
      ranked_rating integer NOT NULL DEFAULT 1000,
      daily_problems_solved integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateAuthInput(input: {
  name?: unknown;
  username?: unknown;
  email?: unknown;
  password?: unknown;
}) {
  const usernameSource = input.username ?? input.name;
  const username =
    typeof usernameSource === "string" ? usernameSource.trim() : "";
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const password = typeof input.password === "string" ? input.password : "";
  const errors: Record<string, string> = {};

  if (usernameSource !== undefined && username.length < 2) {
    errors.username = "Informe um nome de usuário com pelo menos 2 caracteres.";
  } else if (usernameSource !== undefined && username.length > 32) {
    errors.username = "Use no máximo 32 caracteres.";
  } else if (
    usernameSource !== undefined &&
    !/^[\p{L}\p{N} _.-]+$/u.test(username)
  ) {
    errors.username = "Use apenas letras, números, espaço, ponto, hífen ou _.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Informe um email válido.";
  }

  if (password.length < 8) {
    errors.password = "A senha precisa ter pelo menos 8 caracteres.";
  } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = "A senha precisa combinar letras e números.";
  }

  return {
    data: { username, email, password },
    errors,
    ok: Object.keys(errors).length === 0,
  };
}

export function hasAcceptedTerms(value: unknown) {
  return value === true || value === "true" || value === "on" || value === "1";
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(
    password,
    salt,
    PASSWORD_KEY_LENGTH,
  )) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, salt, hash] = passwordHash.split(":");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const storedKey = Buffer.from(hash, "hex");
  const derivedKey = (await scrypt(
    password,
    salt,
    storedKey.length,
  )) as Buffer;

  return (
    storedKey.length === derivedKey.length &&
    timingSafeEqual(storedKey, derivedKey)
  );
}

function toPublicAuthUser(user: AuthUser): PublicAuthUser {
  const isProfileComplete = Boolean(
    user.username && user.terms_accepted && user.privacy_acknowledged,
  );

  return {
    id: user.id,
    name: isProfileComplete ? user.username : null,
    email: user.email,
    provider: user.provider,
    username: user.username,
    needsUsername: !isProfileComplete,
  };
}

export function isAuthProvider(value: unknown): value is AuthProvider {
  return (
    typeof value === "string" &&
    AUTH_PROVIDERS.includes(value as AuthProvider)
  );
}

export function providerLabel(provider: AuthProvider) {
  return provider === "credentials"
    ? "email e senha"
    : provider === "google"
      ? "Google"
      : "GitHub";
}

export async function ensureUserAchievements(userId: string) {
  await ensureUsersSchema();

  const result = await dbQuery<UserAchievements>(
    `
      INSERT INTO user_achievements (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING
        user_id::text AS user_id,
        total_matches_played,
        ranked_matches_played,
        total_matches_won,
        ranked_matches_won,
        ranked_rating,
        daily_problems_solved,
        created_at,
        updated_at
    `,
    [userId],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  return getUserAchievements(userId);
}

export async function getUserAchievements(userId: string) {
  await ensureUsersSchema();

  const result = await dbQuery<UserAchievements>(
    `
      SELECT
        user_id::text AS user_id,
        total_matches_played,
        ranked_matches_played,
        total_matches_won,
        ranked_matches_won,
        ranked_rating,
        daily_problems_solved,
        created_at,
        updated_at
      FROM user_achievements
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function incrementDailyProblemsSolved(userId: string) {
  await ensureUsersSchema();

  const result = await dbQuery<UserAchievements>(
    `
      INSERT INTO user_achievements (user_id, daily_problems_solved)
      VALUES ($1, 1)
      ON CONFLICT (user_id) DO UPDATE
      SET daily_problems_solved = user_achievements.daily_problems_solved + 1,
          updated_at = now()
      RETURNING
        user_id::text AS user_id,
        total_matches_played,
        ranked_matches_played,
        total_matches_won,
        ranked_matches_won,
        ranked_rating,
        daily_problems_solved,
        created_at,
        updated_at
    `,
    [userId],
  );

  return result.rows[0];
}

export async function getUserByEmail(email: string) {
  await ensureUsersSchema();

  const result = await dbQuery<AuthUser>(
    `
      SELECT
        id::text AS id,
        name,
        username,
        email,
        provider,
        password_hash,
        privacy_acknowledged,
        privacy_acknowledged_at,
        privacy_version,
        terms_accepted,
        terms_accepted_at,
        terms_version,
        created_at,
        updated_at
      FROM users
      WHERE email_normalized = $1
      LIMIT 1
    `,
    [normalizeEmail(email)],
  );

  return result.rows[0] ?? null;
}

export async function getUserById(userId: string) {
  await ensureUsersSchema();

  const result = await dbQuery<AuthUser>(
    `
      SELECT
        id::text AS id,
        name,
        username,
        email,
        provider,
        password_hash,
        privacy_acknowledged,
        privacy_acknowledged_at,
        privacy_version,
        terms_accepted,
        terms_accepted_at,
        terms_version,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

export async function authenticateUser(email: string, password: string) {
  const user = await getUserByEmail(email);

  if (!user || user.provider !== "credentials" || !user.password_hash) {
    return null;
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);

  if (!passwordMatches) {
    return null;
  }

  if (!user.terms_accepted || !user.privacy_acknowledged) {
    return null;
  }

  await ensureUserAchievements(user.id);

  return toPublicAuthUser(user);
}

export async function createCredentialsUser(input: {
  username: string;
  email: string;
  password: string;
}) {
  await ensureUsersSchema();

  const passwordHash = await hashPassword(input.password);
  const result = await dbQuery<AuthUser>(
    `
      INSERT INTO users (
        name,
        username,
        email,
        provider,
        password_hash,
        privacy_acknowledged,
        privacy_acknowledged_at,
        privacy_version,
        terms_accepted,
        terms_accepted_at,
        terms_version
      )
      VALUES ($1, $1, $2, 'credentials', $3, true, now(), $4, true, now(), $5)
      RETURNING
        id::text AS id,
        name,
        username,
        email,
        provider,
        password_hash,
        privacy_acknowledged,
        privacy_acknowledged_at,
        privacy_version,
        terms_accepted,
        terms_accepted_at,
        terms_version,
        created_at,
        updated_at
    `,
    [
      input.username.trim(),
      normalizeEmail(input.email),
      passwordHash,
      CURRENT_PRIVACY_VERSION,
      CURRENT_TERMS_VERSION,
    ],
  );

  const user = result.rows[0];

  await ensureUserAchievements(user.id);

  return toPublicAuthUser(user);
}

export async function getOrCreateOAuthUser(input: {
  email: string;
  provider: Extract<AuthProvider, "google" | "github">;
}) {
  await ensureUsersSchema();

  const existingUser = await getUserByEmail(input.email);

  if (existingUser) {
    if (existingUser.provider !== input.provider) {
      return null;
    }

    await ensureUserAchievements(existingUser.id);
    return toPublicAuthUser(existingUser);
  }

  const result = await dbQuery<AuthUser>(
    `
      INSERT INTO users (name, username, email, provider, password_hash)
      VALUES (NULL, NULL, $1, $2, NULL)
      RETURNING
        id::text AS id,
        name,
        username,
        email,
        provider,
        password_hash,
        privacy_acknowledged,
        privacy_acknowledged_at,
        privacy_version,
        terms_accepted,
        terms_accepted_at,
        terms_version,
        created_at,
        updated_at
    `,
    [normalizeEmail(input.email), input.provider],
  );

  const user = result.rows[0];

  await ensureUserAchievements(user.id);

  return toPublicAuthUser(user);
}

export async function setUserUsername(input: {
  userId: string;
  username: string;
  acceptedTerms: boolean;
}) {
  await ensureUsersSchema();

  const username = input.username.trim();
  const result = await dbQuery<AuthUser>(
    `
      UPDATE users
      SET
        username = $2,
        name = $2,
        privacy_acknowledged = $3::boolean,
        privacy_acknowledged_at = CASE
          WHEN $3::boolean THEN COALESCE(privacy_acknowledged_at, now())
          ELSE privacy_acknowledged_at
        END,
        privacy_version = CASE
          WHEN $3::boolean THEN COALESCE(privacy_version, $5)
          ELSE privacy_version
        END,
        terms_accepted = $3::boolean,
        terms_accepted_at = CASE
          WHEN $3::boolean THEN COALESCE(terms_accepted_at, now())
          ELSE terms_accepted_at
        END,
        terms_version = CASE
          WHEN $3::boolean THEN COALESCE(terms_version, $4)
          ELSE terms_version
        END,
        updated_at = now()
      WHERE id = $1
      RETURNING
        id::text AS id,
        name,
        username,
        email,
        provider,
        password_hash,
        privacy_acknowledged,
        privacy_acknowledged_at,
        privacy_version,
        terms_accepted,
        terms_accepted_at,
        terms_version,
        created_at,
        updated_at
    `,
    [
      input.userId,
      username,
      input.acceptedTerms,
      CURRENT_TERMS_VERSION,
      CURRENT_PRIVACY_VERSION,
    ],
  );

  const user = result.rows[0];

  if (!user) {
    return null;
  }

  await ensureUserAchievements(user.id);

  return toPublicAuthUser(user);
}

function isUndefinedTableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "42P01"
  );
}

export async function deleteUserAccount(userId: string) {
  await ensureUsersSchema();

  await dbQuery(
    `DELETE FROM matchmaking_queue WHERE user_id = $1::uuid`,
    [userId],
  ).catch((error: unknown) => {
    if (!isUndefinedTableError(error)) {
      throw error;
    }
  });

  const result = await dbQuery<{ id: string }>(
    `
      DELETE FROM users
      WHERE id = $1::uuid
      RETURNING id::text AS id
    `,
    [userId],
  );

  return Boolean(result.rows[0]);
}
