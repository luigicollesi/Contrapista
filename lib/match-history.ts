import "server-only";

import { dbQuery, type DatabaseClient } from "@/lib/db";
import { ensureUsersSchema } from "@/lib/auth-users";
import type { GameState, RoomMode, RoomUser } from "@/lib/rooms";

type MatchHistoryParticipant = {
  userId: string;
  username: string;
  roomUserId: string;
};

export type MatchHistoryParticipantClue = {
  id: string;
  isFalse: boolean;
  number: number;
  text: string;
};

export type MatchHistoryParticipantSnapshot = MatchHistoryParticipant & {
  achievements?: {
    daily_problems_solved: number;
    ranked_matches_played: number;
    ranked_matches_won: number;
    ranked_rating: number;
    total_matches_played: number;
    total_matches_won: number;
  };
  clues: MatchHistoryParticipantClue[];
  userFinalGuess: string | null;
};

export type MatchHistoryEntry = {
  id: string;
  match_id: string | null;
  case_id: string;
  case_title: string;
  user_id: string;
  username: string;
  winner_user_id: string | null;
  winner_username: string | null;
  official_final_answer: string;
  winning_final_guess: string | null;
  user_final_guess: string | null;
  user_won: boolean;
  finalized_at: string | null;
  stats_recorded: boolean;
  created_at: string;
  case_text: string;
  true_clues: string[];
  false_clues: string[];
  participants: MatchHistoryParticipantSnapshot[];
};

let matchHistorySchemaReady: Promise<void> | null = null;

function normalizeClueArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function displayHistoryUserName(user: RoomUser) {
  return user.nickname?.trim() || "Jogador";
}

function getHistoryParticipants(users: RoomUser[]) {
  const seen = new Set<string>();
  const participants: MatchHistoryParticipant[] = [];

  for (const user of users) {
    const userId = user.accountUserId?.trim();

    if (!userId || seen.has(userId)) {
      continue;
    }

    seen.add(userId);
    participants.push({
      userId,
      username: displayHistoryUserName(user),
      roomUserId: user.id,
    });
  }

  return participants;
}

function getMatchId(state: GameState) {
  return state.matchId ?? crypto.randomUUID();
}

function getParticipantByRoomUserId(users: RoomUser[], roomUserId: string) {
  return getHistoryParticipants(users).find(
    (participant) => participant.roomUserId === roomUserId,
  );
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

function getDistributedHistoryClues({
  caseId,
  falseClues,
  playerCount,
  trueClues,
  userIndex,
}: {
  caseId: string;
  falseClues: string[];
  playerCount: number;
  trueClues: string[];
  userIndex: number;
}) {
  if (playerCount <= 0) {
    return [];
  }

  const trueItems = trueClues.map((text, index) => ({
    id: `true-${index}`,
    isFalse: false,
    text,
  }));
  const falseItems = falseClues.map((text, index) => ({
    id: `false-${index}`,
    isFalse: true,
    text,
  }));
  const totalClues = trueItems.length + falseItems.length;
  const cluesPerPlayer = Math.floor(totalClues / playerCount);
  const usableClueCount = cluesPerPlayer * playerCount;
  const discardCount = totalClues - usableClueCount;
  const falseDiscardCount = Math.min(discardCount, falseItems.length);
  const trueDiscardCount = discardCount - falseDiscardCount;
  const keptFalseItems = falseItems.slice(0, falseItems.length - falseDiscardCount);
  const keptTrueItems = trueItems.slice(0, trueItems.length - trueDiscardCount);
  const distributed = seededShuffle(
    [...keptTrueItems, ...keptFalseItems],
    `${caseId}:distributed-clues:${playerCount}`,
  );

  return distributed
    .slice(userIndex * cluesPerPlayer, (userIndex + 1) * cluesPerPlayer)
    .map((clue, index) => ({ ...clue, number: index + 1 }));
}

async function getCaseCluesForHistory(caseId: string, client: DatabaseClient) {
  const result = await client.query<{
    false_clues: unknown;
    true_clues: unknown;
  }>(
    `
      SELECT true_clues, false_clues
      FROM cases
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [caseId],
  );

  return {
    falseClues: normalizeClueArray(result.rows[0]?.false_clues),
    trueClues: normalizeClueArray(result.rows[0]?.true_clues),
  };
}

function buildParticipantSnapshot({
  caseId,
  falseClues,
  guessesByRoomUserId,
  participants,
  trueClues,
}: {
  caseId: string;
  falseClues: string[];
  guessesByRoomUserId: Record<string, string>;
  participants: MatchHistoryParticipant[];
  trueClues: string[];
}): MatchHistoryParticipantSnapshot[] {
  return participants.map((participant, index) => ({
    ...participant,
    clues: getDistributedHistoryClues({
      caseId,
      falseClues,
      playerCount: participants.length,
      trueClues,
      userIndex: index,
    }),
    userFinalGuess: guessesByRoomUserId[participant.roomUserId]?.trim() || null,
  }));
}

function normalizeParticipantSnapshot(value: unknown) {
  if (!Array.isArray(value)) {
    return [] satisfies MatchHistoryParticipantSnapshot[];
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => ({
      userId: String(item.userId ?? ""),
      username: String(item.username ?? "Jogador"),
      roomUserId: String(item.roomUserId ?? ""),
      userFinalGuess:
        typeof item.userFinalGuess === "string" && item.userFinalGuess.trim()
          ? item.userFinalGuess
          : null,
      clues: Array.isArray(item.clues)
        ? item.clues
            .filter((clue): clue is Record<string, unknown> =>
              Boolean(clue && typeof clue === "object"),
            )
            .map((clue) => ({
              id: String(clue.id ?? ""),
              isFalse: Boolean(clue.isFalse),
              number: Number(clue.number) || 0,
              text: String(clue.text ?? ""),
            }))
        : [],
    }))
    .filter((item) => item.userId);
}

export async function ensureMatchHistorySchema() {
  matchHistorySchemaReady ??= ensureUsersSchema()
    .then(() =>
      dbQuery(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS cases (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          title text NOT NULL CHECK (btrim(title) <> ''),
          case_text text NOT NULL CHECK (btrim(case_text) <> ''),
          final_answer text NOT NULL CHECK (btrim(final_answer) <> ''),
          true_clues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(true_clues) = 'array'),
          false_clues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(false_clues) = 'array'),
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS match_history (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          match_id uuid,
          case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          username text NOT NULL,
          winner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          winner_username text,
          official_final_answer text NOT NULL,
          winning_final_guess text,
          user_final_guess text,
          user_won boolean NOT NULL DEFAULT false,
          participant_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(participant_snapshot) = 'array'),
          finalized_at timestamptz,
          stats_recorded boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        ALTER TABLE match_history
          ADD COLUMN IF NOT EXISTS match_id uuid,
          ADD COLUMN IF NOT EXISTS participant_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(participant_snapshot) = 'array'),
          ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
          ADD COLUMN IF NOT EXISTS stats_recorded boolean NOT NULL DEFAULT false;

        UPDATE match_history
        SET stats_recorded = false
        WHERE stats_recorded IS NULL;

        ALTER TABLE match_history
          ALTER COLUMN stats_recorded SET DEFAULT false,
          ALTER COLUMN stats_recorded SET NOT NULL;

        CREATE INDEX IF NOT EXISTS match_history_user_created_idx
          ON match_history (user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS match_history_case_created_idx
          ON match_history (case_id, created_at DESC);

        CREATE UNIQUE INDEX IF NOT EXISTS match_history_match_user_unique
          ON match_history (match_id, user_id)
          WHERE match_id IS NOT NULL;
      `),
    )
    .then(() => undefined)
    .catch((error) => {
      matchHistorySchemaReady = null;
      throw error;
    });

  return matchHistorySchemaReady;
}

export async function recordEliminatedPlayerHistory({
  caseId,
  finalAnswer,
  state,
  users,
  eliminatedRoomUserId,
  client,
}: {
  caseId: string | null;
  finalAnswer: string;
  state: GameState;
  users: RoomUser[];
  eliminatedRoomUserId: string;
  client: DatabaseClient;
}) {
  if (!caseId || state.matchHistoryRecordedAt) {
    return state;
  }

  await ensureMatchHistorySchema();

  const participant = getParticipantByRoomUserId(users, eliminatedRoomUserId);

  if (!participant) {
    return state;
  }

  const matchId = getMatchId(state);
  const userGuess = state.finalGuessesByUserId?.[participant.roomUserId]?.trim() || null;
  const { falseClues, trueClues } = await getCaseCluesForHistory(caseId, client);
  const snapshot = buildParticipantSnapshot({
    caseId,
    falseClues,
    guessesByRoomUserId: state.finalGuessesByUserId ?? {},
    participants: getHistoryParticipants(users),
    trueClues,
  });

  await client.query(
    `
      INSERT INTO match_history (
        match_id,
        case_id,
        user_id,
        username,
        official_final_answer,
        user_final_guess,
        participant_snapshot,
        user_won
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, false)
      ON CONFLICT (match_id, user_id) WHERE match_id IS NOT NULL DO UPDATE
      SET username = EXCLUDED.username,
          official_final_answer = EXCLUDED.official_final_answer,
          user_final_guess = COALESCE(EXCLUDED.user_final_guess, match_history.user_final_guess),
          participant_snapshot = EXCLUDED.participant_snapshot
    `,
    [
      matchId,
      caseId,
      participant.userId,
      participant.username,
      finalAnswer,
      userGuess,
      JSON.stringify(snapshot),
    ],
  );

  return {
    ...state,
    matchId,
  } satisfies GameState;
}

export async function recordMatchHistory({
  caseId,
  finalAnswer,
  state,
  users,
  winnerRoomUserId,
  winningFinalGuess,
  mode,
  client,
}: {
  caseId: string | null;
  finalAnswer: string;
  state: GameState;
  users: RoomUser[];
  winnerRoomUserId: string | null;
  winningFinalGuess: string | null;
  mode: RoomMode;
  client: DatabaseClient;
}) {
  if (!caseId || state.matchHistoryRecordedAt) {
    return state;
  }

  await ensureMatchHistorySchema();

  const participants = getHistoryParticipants(users);

  if (!participants.length) {
    return {
      ...state,
      matchHistoryRecordedAt: Date.now(),
    } satisfies GameState;
  }

  const winner = winnerRoomUserId
    ? participants.find((participant) => participant.roomUserId === winnerRoomUserId)
    : null;
  const guessesByUserId = state.finalGuessesByUserId ?? {};
  const matchId = getMatchId(state);
  const finalizedAt = new Date();
  const { falseClues, trueClues } = await getCaseCluesForHistory(caseId, client);
  const participantSnapshot = buildParticipantSnapshot({
    caseId,
    falseClues,
    guessesByRoomUserId: guessesByUserId,
    participants,
    trueClues,
  });

  for (const participant of participants) {
    const userWon = Boolean(winner && participant.userId === winner.userId);

    const historyResult = await client.query<{ stats_recorded: boolean }>(
      `
        INSERT INTO match_history (
          match_id,
          case_id,
          user_id,
          username,
          winner_user_id,
          winner_username,
          official_final_answer,
          winning_final_guess,
          user_final_guess,
          user_won,
          participant_snapshot,
          finalized_at,
          stats_recorded
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7, $8, $9, $10, $11::jsonb, $12, false)
        ON CONFLICT (match_id, user_id) WHERE match_id IS NOT NULL DO UPDATE
        SET username = EXCLUDED.username,
            winner_user_id = EXCLUDED.winner_user_id,
            winner_username = EXCLUDED.winner_username,
            official_final_answer = EXCLUDED.official_final_answer,
            winning_final_guess = EXCLUDED.winning_final_guess,
            user_final_guess = COALESCE(match_history.user_final_guess, EXCLUDED.user_final_guess),
            user_won = EXCLUDED.user_won,
            participant_snapshot = EXCLUDED.participant_snapshot,
            finalized_at = EXCLUDED.finalized_at
        RETURNING stats_recorded
      `,
      [
        matchId,
        caseId,
        participant.userId,
        participant.username,
        winner?.userId ?? null,
        winner?.username ?? null,
        finalAnswer,
        winningFinalGuess?.trim() || null,
        guessesByUserId[participant.roomUserId]?.trim() || null,
        userWon,
        JSON.stringify(participantSnapshot),
        finalizedAt,
      ],
    );
    const statsAlreadyRecorded = Boolean(historyResult.rows[0]?.stats_recorded);

    if (statsAlreadyRecorded) {
      continue;
    }

    await client.query(
      `
        INSERT INTO user_achievements (
          user_id,
          total_matches_played,
          ranked_matches_played,
          total_matches_won,
          ranked_matches_won
        )
        VALUES (
          $1::uuid,
          1,
          CASE WHEN $2 = 'ranked' THEN 1 ELSE 0 END,
          CASE WHEN $3 THEN 1 ELSE 0 END,
          CASE WHEN $2 = 'ranked' AND $3 THEN 1 ELSE 0 END
        )
        ON CONFLICT (user_id) DO UPDATE
        SET total_matches_played = user_achievements.total_matches_played + 1,
            ranked_matches_played = user_achievements.ranked_matches_played +
              CASE WHEN $2 = 'ranked' THEN 1 ELSE 0 END,
            total_matches_won = user_achievements.total_matches_won +
              CASE WHEN $3 THEN 1 ELSE 0 END,
            ranked_matches_won = user_achievements.ranked_matches_won +
              CASE WHEN $2 = 'ranked' AND $3 THEN 1 ELSE 0 END,
            updated_at = now()
      `,
      [participant.userId, mode, userWon],
    );

    await client.query(
      `
        UPDATE match_history
        SET stats_recorded = true
        WHERE match_id = $1::uuid
          AND user_id = $2::uuid
      `,
      [matchId, participant.userId],
    );
  }

  return {
    ...state,
    matchId,
    matchHistoryRecordedAt: Date.now(),
  } satisfies GameState;
}

export async function listUserMatchHistory(
  userId: string,
  limit = 30,
): Promise<MatchHistoryEntry[]> {
  await ensureMatchHistorySchema();

  const result = await dbQuery<Omit<MatchHistoryEntry, "participants"> & {
    participant_snapshot: unknown;
  }>(
    `
      SELECT
        mh.id::text AS id,
        mh.match_id::text AS match_id,
        mh.case_id::text AS case_id,
        c.title AS case_title,
        mh.user_id::text AS user_id,
        mh.username,
        mh.winner_user_id::text AS winner_user_id,
        mh.winner_username,
        mh.official_final_answer,
        mh.winning_final_guess,
        mh.user_final_guess,
        mh.user_won,
        mh.participant_snapshot,
        mh.finalized_at,
        mh.stats_recorded,
        mh.created_at,
        c.case_text,
        c.true_clues,
        c.false_clues
      FROM match_history mh
      JOIN cases c ON c.id = mh.case_id
      WHERE mh.user_id = $1::uuid
      ORDER BY mh.created_at DESC
      LIMIT $2
    `,
    [userId, Math.max(1, Math.min(100, Math.floor(limit)))],
  );
  const entries = result.rows.map((row) => ({
    ...row,
    participants: normalizeParticipantSnapshot(row.participant_snapshot),
    true_clues: normalizeClueArray(row.true_clues),
    false_clues: normalizeClueArray(row.false_clues),
  }));
  const participantUserIds = Array.from(
    new Set(entries.flatMap((entry) => entry.participants.map((participant) => participant.userId))),
  );

  if (!participantUserIds.length) {
    return entries;
  }

  const achievementsResult = await dbQuery<{
    daily_problems_solved: number;
    ranked_matches_played: number;
    ranked_matches_won: number;
    ranked_rating: number;
    total_matches_played: number;
    total_matches_won: number;
    user_id: string;
  }>(
    `
      SELECT
        user_id::text AS user_id,
        total_matches_played,
        ranked_matches_played,
        total_matches_won,
        ranked_matches_won,
        ranked_rating,
        daily_problems_solved
      FROM user_achievements
      WHERE user_id = ANY($1::uuid[])
    `,
    [participantUserIds],
  );
  const achievementsByUserId = new Map(
    achievementsResult.rows.map((row) => [row.user_id, row]),
  );

  return entries.map((entry) => ({
    ...entry,
    participants: entry.participants.map((participant) => {
      const achievements = achievementsByUserId.get(participant.userId);

      return achievements
        ? {
            ...participant,
            achievements: {
              daily_problems_solved: achievements.daily_problems_solved,
              ranked_matches_played: achievements.ranked_matches_played,
              ranked_matches_won: achievements.ranked_matches_won,
              ranked_rating: achievements.ranked_rating,
              total_matches_played: achievements.total_matches_played,
              total_matches_won: achievements.total_matches_won,
            },
          }
        : participant;
    }),
  }));
}

export async function getUserMatchHistoryEntry({
  historyId,
  userId,
}: {
  historyId: string;
  userId: string;
}) {
  await ensureMatchHistorySchema();

  const result = await dbQuery<Omit<MatchHistoryEntry, "participants"> & {
    participant_snapshot: unknown;
  }>(
    `
      SELECT
        mh.id::text AS id,
        mh.match_id::text AS match_id,
        mh.case_id::text AS case_id,
        c.title AS case_title,
        mh.user_id::text AS user_id,
        mh.username,
        mh.winner_user_id::text AS winner_user_id,
        mh.winner_username,
        mh.official_final_answer,
        mh.winning_final_guess,
        mh.user_final_guess,
        mh.user_won,
        mh.participant_snapshot,
        mh.finalized_at,
        mh.stats_recorded,
        mh.created_at,
        c.case_text,
        c.true_clues,
        c.false_clues
      FROM match_history mh
      JOIN cases c ON c.id = mh.case_id
      WHERE mh.user_id = $1::uuid
        AND mh.id = $2::uuid
      LIMIT 1
    `,
    [userId, historyId],
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const entry = {
    ...row,
    participants: normalizeParticipantSnapshot(row.participant_snapshot),
    true_clues: normalizeClueArray(row.true_clues),
    false_clues: normalizeClueArray(row.false_clues),
  };
  const participantUserIds = Array.from(
    new Set(entry.participants.map((participant) => participant.userId)),
  );

  if (!participantUserIds.length) {
    return entry;
  }

  const achievementsResult = await dbQuery<{
    daily_problems_solved: number;
    ranked_matches_played: number;
    ranked_matches_won: number;
    ranked_rating: number;
    total_matches_played: number;
    total_matches_won: number;
    user_id: string;
  }>(
    `
      SELECT
        user_id::text AS user_id,
        total_matches_played,
        ranked_matches_played,
        total_matches_won,
        ranked_matches_won,
        ranked_rating,
        daily_problems_solved
      FROM user_achievements
      WHERE user_id = ANY($1::uuid[])
    `,
    [participantUserIds],
  );
  const achievementsByUserId = new Map(
    achievementsResult.rows.map((achievement) => [
      achievement.user_id,
      achievement,
    ]),
  );

  return {
    ...entry,
    participants: entry.participants.map((participant) => {
      const achievements = achievementsByUserId.get(participant.userId);

      return achievements
        ? {
            ...participant,
            achievements: {
              daily_problems_solved: achievements.daily_problems_solved,
              ranked_matches_played: achievements.ranked_matches_played,
              ranked_matches_won: achievements.ranked_matches_won,
              ranked_rating: achievements.ranked_rating,
              total_matches_played: achievements.total_matches_played,
              total_matches_won: achievements.total_matches_won,
            },
          }
        : participant;
    }),
  } satisfies MatchHistoryEntry;
}
