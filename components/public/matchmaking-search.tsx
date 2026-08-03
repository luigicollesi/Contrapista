"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse, withCsrfHeader } from "@/lib/client-http";
import { getBrowserId, saveSession } from "@/lib/client-session";

type MatchmakingMode = "casual" | "ranked";

type MatchmakingSearchProps = {
  mode: MatchmakingMode;
};

type MatchmakingResponse = {
  matchSize?: number;
  matched?: boolean;
  waiting?: boolean;
  waitingCount?: number;
  room?: {
    code: string;
  };
  user?: {
    id: string;
    browserId: string;
    nickname: string | null;
    color?: string | null;
  };
  error?: string;
};

const modeCopy = {
  casual: {
    title: "Buscando jogo casual",
    eyebrow: "4 jogadores · cada um por si",
    body: "Procurando uma mesa casual.",
  },
  ranked: {
    title: "Buscando jogo rankeado",
    eyebrow: "4 jogadores · rating similar",
    body: "Procurando uma mesa compatível.",
  },
} satisfies Record<
  MatchmakingMode,
  {
    body: string;
    eyebrow: string;
    title: string;
  }
>;

export function MatchmakingSearch({ mode }: MatchmakingSearchProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [queueProgress, setQueueProgress] = useState({
    matchSize: 4,
    waitingCount: 0,
  });
  const hasMatchedQueueRef = useRef(false);
  const copy = modeCopy[mode];
  const pulseText = useMemo(() => {
    const dots = ".".repeat((elapsedSeconds % 3) + 1);
    return `Procurando mesa${dots}`;
  }, [elapsedSeconds]);
  const queueSlots = useMemo(
    () => Array.from({ length: queueProgress.matchSize }, (_, index) => index),
    [queueProgress.matchSize],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let isActive = true;
    const browserId = getBrowserId();
    hasMatchedQueueRef.current = false;

    async function handleResponse(response: Response) {
      const data = await readJsonResponse<MatchmakingResponse>(response);

      if (!isActive) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Não deu para consultar a fila.");
      }

      setQueueProgress({
        matchSize: Math.max(1, data.matchSize ?? 4),
        waitingCount: Math.max(0, data.waitingCount ?? 0),
      });

      if (data.matched && data.room?.code && data.user) {
        hasMatchedQueueRef.current = true;
        saveSession({
          roomCode: data.room.code,
          user: data.user,
        });
        router.replace(`/sala/${data.room.code}`);
      }
    }

    async function joinQueue() {
      const response = await fetch("/api/matchmaking", withCsrfHeader({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserId, mode }),
      }));

      await handleResponse(response);
    }

    async function pollQueue() {
      const response = await fetch("/api/matchmaking", withCsrfHeader({
        body: JSON.stringify({ action: "heartbeat", browserId, mode }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }));

      await handleResponse(response);
    }

    joinQueue().catch((caughtError) => {
      if (isActive) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Não deu para entrar na fila.",
        );
      }
    });

    const interval = window.setInterval(() => {
      pollQueue().catch((caughtError) => {
        if (isActive) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Não deu para consultar a fila.",
          );
        }
      });
    }, 2500);

    return () => {
      isActive = false;
      window.clearInterval(interval);

      if (!hasMatchedQueueRef.current) {
        void fetch("/api/matchmaking", withCsrfHeader({
          body: JSON.stringify({ browserId, mode }),
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          method: "DELETE",
        })).catch(() => undefined);
      }
    };
  }, [mode, router]);

  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-5xl flex-col justify-center">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-4 max-w-4xl font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          {copy.title}
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-300">
          {copy.body}
        </p>

        <div className="mt-12 border-y border-[#d0a85c]/25 py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-5xl font-black text-[#d0a85c]">
                {String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:
                {String(elapsedSeconds % 60).padStart(2, "0")}
              </p>
              <p className="mt-3 text-sm font-bold uppercase tracking-[0.2em] text-stone-400">
                {pulseText}
              </p>
            </div>
            <div className="max-w-sm text-sm leading-7 text-stone-300">
              <p className="font-bold uppercase tracking-[0.18em] text-[#f2e6c8]">
                {queueProgress.waitingCount}/{queueProgress.matchSize} jogadores
              </p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {queueSlots.map((slot) => {
                  const isFilled = slot < queueProgress.waitingCount;

                  return (
                    <span
                      aria-hidden="true"
                      className={
                        isFilled
                          ? "h-2 rounded-full bg-[#d0a85c] shadow-[0_0_16px_rgba(208,168,92,0.45)]"
                          : "h-2 rounded-full border border-[#d0a85c]/25 bg-stone-950/70"
                      }
                      key={slot}
                    />
                  );
                })}
              </div>
              <p className="mt-4">A sala abre quando a mesa estiver completa.</p>
            </div>
          </div>
        </div>

        {error ? (
          <p className="mt-6 max-w-xl rounded-sm border border-red-400/30 bg-red-950/45 px-4 py-3 text-sm font-medium text-red-100">
            {error}
          </p>
        ) : null}

        <Link
          className="mt-8 inline-flex h-11 w-fit items-center justify-center rounded-sm border border-[#d0a85c]/45 px-5 text-sm font-bold uppercase tracking-[0.16em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
          href="/jogar"
        >
          Voltar aos modos
        </Link>
      </section>
    </main>
  );
}
