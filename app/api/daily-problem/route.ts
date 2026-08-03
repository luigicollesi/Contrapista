import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import {
  getDailyProblemForUserByDate,
  listDailyProblemDates,
  submitDailyProblemAnswer,
} from "@/lib/daily-problem";
import { rateLimitResponse } from "@/lib/security/rate-limit";

function unauthorized() {
  return Response.json(
    { error: "Entre para acessar o desafio diário." },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 60,
    namespace: "daily-problem-read",
    request,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const listDates = url.searchParams.get("dates") === "1";

  try {
    if (listDates) {
      return Response.json({
        dates: await listDailyProblemDates(),
      });
    }

    return Response.json({
      problem: await getDailyProblemForUserByDate({
        date,
        userId: session.user.id,
      }),
    });
  } catch (error) {
    return errorResponse(error, "Não deu para carregar o desafio.");
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 6,
    namespace: "daily-problem-submit",
    request,
    windowMs: 60 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const body = (await request.json().catch(() => ({}))) as {
    answer?: string;
    date?: string;
  };

  if (!body.answer?.trim()) {
    return Response.json({ error: "Resposta inválida." }, { status: 400 });
  }

  try {
    const result = await submitDailyProblemAnswer({
      answer: body.answer,
      date: body.date,
      userId: session.user.id,
    });
    const status = result.correct || !result.cooldownUntil ? 200 : 429;

    return Response.json(result, { status });
  } catch (error) {
    return errorResponse(error, "Não deu para avaliar sua resposta.");
  }
}
