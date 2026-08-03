"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type SubmitEvent,
} from "react";
import { readJsonResponse, withCsrfHeader } from "@/lib/client-http";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";

type DailyProblem = {
  date: string;
  title: string;
  caseText: string;
  clues: string[];
  solved: boolean;
  submittedAnswer?: string | null;
  officialAnswer?: string;
  cooldownUntil?: string | null;
};

type DailyProblemResponse = {
  problem?: DailyProblem;
  dates?: { date: string }[];
  correct?: boolean;
  cooldownUntil?: string | null;
  error?: string;
};

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

const selectedDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

function formatCooldown(cooldownUntil?: string | null) {
  if (!cooldownUntil) {
    return "";
  }

  const diffMs = new Date(cooldownUntil).getTime() - Date.now();

  if (diffMs <= 0) {
    return "";
  }

  const minutes = Math.ceil(diffMs / 60_000);

  return `Tente de novo em ${minutes} min.`;
}

function toLocalDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatSelectedDate(date: string) {
  return selectedDateFormatter.format(toLocalDate(date));
}

function toDateKey(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMonthFromDate(date: string) {
  const parsedDate = toLocalDate(date);

  return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
}

export function DailyProblem() {
  const [problem, setProblem] = useState<DailyProblem | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isLoadingProblem, setIsLoadingProblem] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthFromDate(new Date().toISOString().slice(0, 10)));
  const [isPending, startTransition] = useTransition();
  const availableDateSet = useMemo(
    () => new Set(availableDates),
    [availableDates],
  );
  const cooldownMessage = useMemo(
    () => formatCooldown(problem?.cooldownUntil),
    [problem?.cooldownUntil],
  );
  const canSubmit = Boolean(answer.trim()) && !problem?.solved && !cooldownMessage;
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const monthIndex = calendarMonth.getMonth();
    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    return [
      ...Array.from({ length: firstWeekday }, (_, index) => ({
        day: null,
        key: `empty-${index}`,
      })),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const date = toDateKey(year, monthIndex, day);

        return {
          date,
          day,
          key: date,
        };
      }),
    ];
  }, [calendarMonth]);

  const loadAvailableDates = useCallback(async () => {
    const response = await fetch("/api/daily-problem?dates=1", { cache: "no-store" });
    const data = await readJsonResponse<DailyProblemResponse>(response);

    if (!response.ok || !data.dates) {
      throw new Error(data.error ?? "Não deu para carregar o calendário.");
    }

    setAvailableDates(data.dates.map((item) => item.date));
  }, []);

  const loadProblem = useCallback(async (date?: string) => {
    const searchParams = new URLSearchParams();

    if (date) {
      searchParams.set("date", date);
    }

    try {
      const response = await fetch(
        `/api/daily-problem${searchParams.size ? `?${searchParams.toString()}` : ""}`,
        { cache: "no-store" },
      );
      const data = await readJsonResponse<DailyProblemResponse>(response);

      if (!response.ok || !data.problem) {
        throw new Error(data.error ?? "Não deu para carregar o desafio.");
      }

      setAnswer("");
      setProblem(data.problem);
      setCalendarMonth(getMonthFromDate(data.problem.date));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para carregar o desafio.",
      );
    } finally {
      setIsLoadingProblem(false);
    }
  }, []);

  useEffect(() => {
    let isActive = true;

    fetch("/api/daily-problem", { cache: "no-store" })
      .then(async (response) => {
        const data = await readJsonResponse<DailyProblemResponse>(response);

        if (!isActive) {
          return;
        }

        if (!response.ok || !data.problem) {
          throw new Error(data.error ?? "Não deu para carregar o desafio.");
        }

        setProblem(data.problem);
        setCalendarMonth(getMonthFromDate(data.problem.date));
      })
      .catch((caughtError) => {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Não deu para carregar o desafio.",
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingProblem(false);
        }
      });

    fetch("/api/daily-problem?dates=1", { cache: "no-store" })
      .then(async (response) => {
        const data = await readJsonResponse<DailyProblemResponse>(response);

        if (!isActive) {
          return;
        }

        if (!response.ok || !data.dates) {
          throw new Error(data.error ?? "Não deu para carregar o calendário.");
        }

        setAvailableDates(data.dates.map((item) => item.date));
      })
      .catch((caughtError) => {
        if (isActive) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Não deu para carregar o calendário.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  function submitAnswer(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    startTransition(async () => {
      const response = await fetch("/api/daily-problem", withCsrfHeader({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, date: problem?.date }),
      }));
      const data = await readJsonResponse<DailyProblemResponse>(response);

      if (data.problem) {
        setProblem(data.problem);
      }

      if (response.ok && data.correct) {
        setNotice("Você acertou. A resposta oficial foi liberada.");
        setAnswer("");
        return;
      }

      if (response.status === 429) {
        setError(data.cooldownUntil ? formatCooldown(data.cooldownUntil) : "Ainda não foi dessa vez. Aguarde para tentar de novo.");
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Não deu para avaliar sua resposta.");
      }
    });
  }

  function openCalendar() {
    setIsCalendarOpen(true);

    if (!availableDates.length) {
      void loadAvailableDates().catch((caughtError) => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Não deu para carregar o calendário.",
        );
      });
    }
  }

  function selectProblemDate(date: string) {
    setIsCalendarOpen(false);
    setIsLoadingProblem(true);
    setError("");
    setNotice("");
    void loadProblem(date);
  }

  return (
    <main className="sy-theme public-red-details min-h-screen bg-[#0e1111] px-3 py-6 text-stone-50 sm:px-6 sm:py-10 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c] sm:text-sm sm:tracking-[0.32em]">
          Problema diário
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="max-w-4xl font-serif text-4xl font-bold leading-tight text-[#f2e6c8] sm:text-7xl">
            Desafio do dia
          </h1>
          <button
            className="inline-flex h-11 w-full items-center justify-center rounded-sm border border-[#d0a85c]/50 px-5 text-sm font-black uppercase tracking-[0.16em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 sm:w-fit"
            onClick={openCalendar}
            type="button"
          >
            Escolher data
          </button>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-300 sm:mt-6 sm:text-lg sm:leading-8">
          Um caso por dia. Todas as pistas à vista. Uma tese por vez.
        </p>

        {isLoadingProblem && !problem && !error ? (
          <p className="mt-10 border-y border-[#d0a85c]/20 py-8 text-stone-300">
            Carregando desafio...
          </p>
        ) : null}

        {error && !problem ? (
          <div className="mt-10 rounded-sm border border-red-400/30 bg-red-950/45 px-4 py-3 text-sm font-medium text-red-100">
            {error}
          </div>
        ) : null}

        {problem ? (
          <div className="mt-7 grid gap-6 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
            <article className="border-y border-[#d0a85c]/20 py-6 sm:py-8">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d0a85c]">
                {formatSelectedDate(problem.date)}
              </p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-[#f2e6c8] sm:text-4xl">
                {problem.title}
              </h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-300 sm:mt-6 sm:text-base sm:leading-8">
                {problem.caseText}
              </p>

              <section className="mt-7 sm:mt-10">
                <h3 className="font-serif text-2xl font-bold text-[#f2e6c8] sm:text-3xl">
                  Pistas disponíveis
                </h3>
                <div className="mt-4 grid gap-2 sm:mt-5 md:grid-cols-2 md:gap-3">
                  {problem.clues.map((clue, index) => (
                    <div
                      className="border-l border-[#d0a85c]/35 bg-[#171a1a]/70 px-3 py-2.5 text-sm leading-6 text-stone-300 sm:px-4 sm:py-3 sm:leading-7"
                      key={`${index}:${clue}`}
                    >
                      {clue}
                    </div>
                  ))}
                </div>
              </section>
            </article>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <form
                className="rounded-sm border border-[#d0a85c]/30 bg-[#171a1a] p-4 shadow-2xl shadow-black/25 sm:p-5"
                onSubmit={submitAnswer}
              >
                <h3 className="font-serif text-2xl font-bold text-[#f2e6c8] sm:text-3xl">
                  Sua tese
                </h3>
                <textarea
                  className="mt-4 min-h-32 w-full rounded-sm border border-[#d0a85c]/30 bg-[#0e1111] p-3 text-base text-stone-50 outline-none transition focus:border-[#d0a85c] focus:ring-2 focus:ring-[#d0a85c]/20 disabled:opacity-60 sm:mt-5 sm:min-h-36 sm:text-sm"
                  disabled={problem.solved || Boolean(cooldownMessage) || isPending}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Escreva sua solução..."
                  value={answer}
                />
                {problem.solved ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-100">
                    Desafio resolvido.
                  </p>
                ) : null}
                {cooldownMessage ? (
                  <p className="mt-3 text-sm font-semibold text-[#f5e7bd]">
                    {cooldownMessage}
                  </p>
                ) : null}
                {error && problem ? (
                  <p className="mt-3 rounded-sm border border-red-400/30 bg-red-950/45 px-3 py-2 text-sm text-red-100">
                    {error}
                  </p>
                ) : null}
                {notice ? (
                  <p className="mt-3 rounded-sm border border-emerald-400/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
                    {notice}
                  </p>
                ) : null}
                <button
                  className="mt-5 h-12 w-full rounded-sm bg-[#d0a85c] px-5 text-sm font-black uppercase tracking-[0.12em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-55 sm:tracking-[0.16em]"
                  disabled={!canSubmit || isPending}
                  type="submit"
                >
                  {isPending ? "Avaliando" : "Enviar resposta"}
                </button>
              </form>

              {problem.solved ? (
                <section className="mt-5 rounded-sm border border-[#d0a85c]/30 bg-[#171a1a] p-5">
                  <h3 className="font-serif text-2xl font-bold text-[#f2e6c8]">
                    Resultado
                  </h3>
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#d0a85c]">
                    Sua resposta
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-300">
                    {problem.submittedAnswer}
                  </p>
                  <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-[#d0a85c]">
                    Resposta oficial
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-stone-300">
                    {problem.officialAnswer}
                  </p>
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}

        <Link
          className="mt-8 inline-flex h-11 items-center justify-center rounded-sm border border-[#d0a85c]/45 px-5 text-sm font-bold uppercase tracking-[0.16em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
          href="/jogar"
        >
          Voltar aos modos
        </Link>

        {isCalendarOpen ? (
          <ResponsiveSheet
            backdropClassName="bg-black/70 backdrop-blur-sm"
            contentClassName="max-w-lg border border-[#d0a85c]/35 bg-[#121515] p-4 text-stone-50 shadow-black/50 sm:w-[34rem] sm:rounded-sm sm:p-5"
          >
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#d0a85c]">
                    Arquivo diário
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]">
                    Escolha uma data
                  </h2>
                </div>
                <button
                  aria-label="Fechar calendário"
                  className="h-9 w-9 rounded-sm border border-[#d0a85c]/35 text-lg font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
                  onClick={() => setIsCalendarOpen(false)}
                  type="button"
                >
                  X
                </button>
              </div>

              <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
                <button
                  className="h-10 rounded-sm border border-[#d0a85c]/35 px-3 text-xs font-black uppercase tracking-[0.08em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 sm:px-4 sm:tracking-[0.14em]"
                  onClick={() =>
                    setCalendarMonth(
                      (currentMonth) =>
                        new Date(
                          currentMonth.getFullYear(),
                          currentMonth.getMonth() - 1,
                          1,
                        ),
                    )
                  }
                  type="button"
                >
                  Anterior
                </button>
                <p className="text-center font-serif text-2xl font-bold capitalize text-[#f2e6c8]">
                  {monthFormatter.format(calendarMonth)}
                </p>
                <button
                  className="h-10 rounded-sm border border-[#d0a85c]/35 px-3 text-xs font-black uppercase tracking-[0.08em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 sm:px-4 sm:tracking-[0.14em]"
                  onClick={() =>
                    setCalendarMonth(
                      (currentMonth) =>
                        new Date(
                          currentMonth.getFullYear(),
                          currentMonth.getMonth() + 1,
                          1,
                        ),
                    )
                  }
                  type="button"
                >
                  Próximo
                </button>
              </div>

              <div className="mt-6 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-[0.08em] text-[#d0a85c] sm:gap-2 sm:text-xs sm:tracking-[0.12em]">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-2">
                {calendarDays.map((day) => {
                  if (!day.day || !day.date) {
                    return <span aria-hidden="true" className="h-10 sm:h-11" key={day.key} />;
                  }

                  const isAvailable = availableDateSet.has(day.date);
                  const isSelected = problem?.date === day.date;

                  return (
                    <button
                      aria-label={
                        isAvailable
                          ? `Abrir problema de ${formatSelectedDate(day.date)}`
                          : `Sem problema em ${formatSelectedDate(day.date)}`
                      }
                      className={[
                        "h-10 rounded-sm border text-sm font-bold transition sm:h-11",
                        isSelected
                          ? "border-[#d0a85c] bg-[#d0a85c] text-[#17130d]"
                          : "border-[#d0a85c]/25 text-[#f5e7bd]",
                        isAvailable
                          ? "hover:border-[#d0a85c] hover:bg-[#d0a85c]/15"
                          : "cursor-not-allowed opacity-35",
                      ].join(" ")}
                      disabled={!isAvailable || isLoadingProblem}
                      key={day.key}
                      onClick={() => selectProblemDate(day.date)}
                      type="button"
                    >
                      {day.day}
                    </button>
                  );
                })}
              </div>

              <p className="mt-5 text-sm leading-6 text-stone-300">
                Só os dias com problema disponível podem ser abertos.
              </p>
            </div>
          </ResponsiveSheet>
        ) : null}
      </section>
    </main>
  );
}
