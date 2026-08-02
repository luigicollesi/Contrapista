export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startDailyProblemScheduler } = await import(
    "@/lib/daily-problem-scheduler"
  );

  startDailyProblemScheduler();
}
