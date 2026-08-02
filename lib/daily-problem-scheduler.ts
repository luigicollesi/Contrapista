import "server-only";

import { ensureDailyProblem } from "@/lib/daily-problem";

const DAILY_PROBLEM_RETRY_MS = 30 * 60 * 1000;
const DAILY_PROBLEM_STARTUP_DELAY_MS = 2_000;
const DAILY_PROBLEM_SCHEDULE_OFFSET_MS = 5_000;

const globalForDailyProblemScheduler = globalThis as typeof globalThis & {
  __contrapistaDailyProblemSchedulerStarted?: boolean;
  __contrapistaDailyProblemSchedulerTimeout?: ReturnType<typeof setTimeout>;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function msUntilNextUtcDay() {
  const now = new Date();
  const nextDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );

  return Math.max(1_000, nextDay - now.getTime() + DAILY_PROBLEM_SCHEDULE_OFFSET_MS);
}

function scheduleNextRun(delayMs: number) {
  globalForDailyProblemScheduler.__contrapistaDailyProblemSchedulerTimeout =
    setTimeout(() => {
      void runDailyProblemScheduler();
    }, delayMs);
}

async function runDailyProblemScheduler() {
  const date = todayKey();

  try {
    const problem = await ensureDailyProblem(date);

    console.info(
      `[daily-problem][scheduler] action=ensure date=${date} caseId=${problem.case_id}`,
    );
    scheduleNextRun(msUntilNextUtcDay());
  } catch (error) {
    console.warn(
      `[daily-problem][scheduler] action=retry date=${date} retryMs=${DAILY_PROBLEM_RETRY_MS} reason=${error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : String(error)}`,
    );
    scheduleNextRun(DAILY_PROBLEM_RETRY_MS);
  }
}

export function startDailyProblemScheduler() {
  if (globalForDailyProblemScheduler.__contrapistaDailyProblemSchedulerStarted) {
    return;
  }

  globalForDailyProblemScheduler.__contrapistaDailyProblemSchedulerStarted = true;
  scheduleNextRun(DAILY_PROBLEM_STARTUP_DELAY_MS);

  console.info("[daily-problem][scheduler] action=start");
}
