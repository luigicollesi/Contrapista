import "server-only";

import { createHash } from "crypto";
import { evaluateAnswer } from "@/lib/answer-judge";
import {
  ensureUsersSchema,
  incrementDailyProblemsSolved,
} from "@/lib/auth-users";
import { getCase, listCaseSummaries, type GameCase } from "@/lib/cases";
import { dbQuery } from "@/lib/db";

const DAILY_ATTEMPT_COOLDOWN_MS = 60 * 60 * 1000;

type DailyProblemRow = {
  problem_date: string;
  case_id: string;
};

export type DailyProblemDate = {
  date: string;
};

type DailyAttemptRow = {
  user_id: string;
  problem_date: string;
  submitted_answer: string | null;
  is_correct: boolean;
  cooldown_until: string | null;
  attempts: number;
  answered_at: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PublicDailyProblem = {
  date: string;
  title: string;
  caseText: string;
  clues: string[];
  solved: boolean;
  submittedAnswer?: string | null;
  officialAnswer?: string;
  cooldownUntil?: string | null;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeProblemDate(date?: string | null) {
  if (!date) {
    return null;
  }

  const normalizedDate = date.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw new Error("Data do problema diário inválida.");
  }

  return normalizedDate;
}

function stableShuffleClues(caseData: GameCase, date: string) {
  return [...caseData.true_clues, ...caseData.false_clues]
    .map((text, index) => ({
      text,
      hash: createHash("sha256")
        .update(`${date}:${caseData.id}:${index}:${text}`)
        .digest("hex"),
    }))
    .sort((left, right) => left.hash.localeCompare(right.hash))
    .map((item) => item.text);
}

async function ensureDailyProblemSchema() {
  await listCaseSummaries(1);
  await ensureUsersSchema();
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS daily_problems (
      problem_date date PRIMARY KEY,
      case_id uuid NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS daily_problem_attempts (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      problem_date date NOT NULL REFERENCES daily_problems(problem_date) ON DELETE CASCADE,
      submitted_answer text,
      is_correct boolean NOT NULL DEFAULT false,
      cooldown_until timestamptz,
      attempts integer NOT NULL DEFAULT 0,
      answered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, problem_date)
    );

    CREATE INDEX IF NOT EXISTS daily_problem_attempts_user_idx
      ON daily_problem_attempts (user_id, problem_date DESC);
  `);
}

export async function ensureDailyProblem(date = todayKey()) {
  await ensureDailyProblemSchema();

  await dbQuery(
    `
      INSERT INTO daily_problems (problem_date, case_id)
      SELECT $1::date, id
      FROM cases
      ORDER BY random()
      LIMIT 1
      ON CONFLICT (problem_date) DO NOTHING
    `,
    [date],
  );

  const result = await dbQuery<DailyProblemRow>(
    `
      SELECT problem_date::text AS problem_date, case_id::text AS case_id
      FROM daily_problems
      WHERE problem_date = $1::date
      LIMIT 1
    `,
    [date],
  );
  const daily = result.rows[0];

  if (!daily) {
    throw new Error("Não há casos cadastrados para sortear o problema diário.");
  }

  return daily;
}

async function getExistingDailyProblem(date: string) {
  await ensureDailyProblemSchema();

  const result = await dbQuery<DailyProblemRow>(
    `
      SELECT problem_date::text AS problem_date, case_id::text AS case_id
      FROM daily_problems
      WHERE problem_date = $1::date
      LIMIT 1
    `,
    [date],
  );

  return result.rows[0] ?? null;
}

async function getDailyProblemByDate(date?: string | null) {
  const selectedDate = normalizeProblemDate(date);

  if (!selectedDate || selectedDate === todayKey()) {
    return ensureDailyProblem(selectedDate ?? undefined);
  }

  const daily = await getExistingDailyProblem(selectedDate);

  if (!daily) {
    throw new Error("Não há problema diário vinculado a essa data.");
  }

  return daily;
}

async function getAttempt(userId: string, date: string) {
  const result = await dbQuery<DailyAttemptRow>(
    `
      SELECT
        user_id::text AS user_id,
        problem_date::text AS problem_date,
        submitted_answer,
        is_correct,
        cooldown_until,
        attempts,
        answered_at,
        created_at,
        updated_at
      FROM daily_problem_attempts
      WHERE user_id = $1::uuid
        AND problem_date = $2::date
      LIMIT 1
    `,
    [userId, date],
  );

  return result.rows[0] ?? null;
}

function toPublicDailyProblem({
  attempt,
  caseData,
  date,
}: {
  attempt: DailyAttemptRow | null;
  caseData: GameCase;
  date: string;
}): PublicDailyProblem {
  const solved = Boolean(attempt?.is_correct);

  return {
    date,
    title: caseData.title,
    caseText: caseData.case_text,
    clues: stableShuffleClues(caseData, date),
    solved,
    submittedAnswer: solved ? attempt?.submitted_answer : null,
    officialAnswer: solved ? caseData.final_answer : undefined,
    cooldownUntil: attempt?.cooldown_until ?? null,
  };
}

export async function getDailyProblemForUser(userId: string) {
  const daily = await getDailyProblemByDate();
  const caseData = await getCase(daily.case_id);

  if (!caseData) {
    throw new Error("Caso diário não encontrado.");
  }

  const attempt = await getAttempt(userId, daily.problem_date);

  return toPublicDailyProblem({
    attempt,
    caseData,
    date: daily.problem_date,
  });
}

export async function getDailyProblemForUserByDate({
  date,
  userId,
}: {
  date?: string | null;
  userId: string;
}) {
  const daily = await getDailyProblemByDate(date);
  const caseData = await getCase(daily.case_id);

  if (!caseData) {
    throw new Error("Caso diário não encontrado.");
  }

  const attempt = await getAttempt(userId, daily.problem_date);

  return toPublicDailyProblem({
    attempt,
    caseData,
    date: daily.problem_date,
  });
}

export async function listDailyProblemDates() {
  await ensureDailyProblemSchema();

  const result = await dbQuery<DailyProblemDate>(
    `
      SELECT problem_date::text AS date
      FROM daily_problems
      ORDER BY problem_date DESC
    `,
  );

  return result.rows;
}

export async function submitDailyProblemAnswer({
  answer,
  date,
  userId,
}: {
  answer: string;
  date?: string | null;
  userId: string;
}) {
  const daily = await getDailyProblemByDate(date);
  const caseData = await getCase(daily.case_id);

  if (!caseData) {
    throw new Error("Caso diário não encontrado.");
  }

  const attempt = await getAttempt(userId, daily.problem_date);
  const now = Date.now();

  if (attempt?.is_correct) {
    return {
      correct: true,
      alreadySolved: true,
      problem: toPublicDailyProblem({
        attempt,
        caseData,
        date: daily.problem_date,
      }),
    };
  }

  if (attempt?.cooldown_until && new Date(attempt.cooldown_until).getTime() > now) {
    return {
      correct: false,
      cooldownUntil: attempt.cooldown_until,
      problem: toPublicDailyProblem({
        attempt,
        caseData,
        date: daily.problem_date,
      }),
    };
  }

  const normalizedAnswer = answer.trim();

  if (normalizedAnswer.length < 3) {
    throw new Error("Escreva uma tentativa antes de enviar.");
  }

  const correct = await evaluateAnswer({
    finalAnswer: caseData.final_answer,
    guess: normalizedAnswer,
    sessionId: `contrapista:daily:${daily.problem_date}:${userId}:judge:v1`,
  });
  const cooldownUntil = correct
    ? null
    : new Date(now + DAILY_ATTEMPT_COOLDOWN_MS).toISOString();

  const result = await dbQuery<DailyAttemptRow>(
    `
      WITH removed_previous_attempt AS (
        DELETE FROM daily_problem_attempts
        WHERE user_id = $1::uuid
          AND problem_date = $2::date
      )
      INSERT INTO daily_problem_attempts (
        user_id,
        problem_date,
        submitted_answer,
        is_correct,
        cooldown_until,
        attempts,
        answered_at
      )
      VALUES ($1::uuid, $2::date, $3, $4, $5::timestamptz, 1, now())
      RETURNING
        user_id::text AS user_id,
        problem_date::text AS problem_date,
        submitted_answer,
        is_correct,
        cooldown_until,
        attempts,
        answered_at,
        created_at,
        updated_at
    `,
    [userId, daily.problem_date, normalizedAnswer, correct, cooldownUntil],
  );
  const nextAttempt = result.rows[0];

  if (correct && !attempt?.is_correct) {
    await incrementDailyProblemsSolved(userId);
  }

  return {
    correct,
    cooldownUntil,
    problem: toPublicDailyProblem({
      attempt: nextAttempt,
      caseData,
      date: daily.problem_date,
    }),
  };
}
