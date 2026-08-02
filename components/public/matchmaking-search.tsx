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
  matched?: boolean;
  waiting?: boolean;
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
    body: "Procurando mais 3 jogadores para uma partida sem impacto no rating.",
  },
  ranked: {
    title: "Buscando jogo rankeado",
    eyebrow: "4 jogadores · rating similar",
    body: "Procurando jogadores com rating próximo para uma partida competitiva.",
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
  const hasJoinedQueueRef = useRef(false);
  const copy = modeCopy[mode];
  const pulseText = useMemo(() => {
    const dots = ".".repeat((elapsedSeconds % 3) + 1);
    return `Procurando mesa${dots}`;
  }, [elapsedSeconds]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let isActive = true;
    const browserId = getBrowserId();

    async function handleResponse(response: Response) {
      const data = await readJsonResponse<MatchmakingResponse>(response);

      if (!isActive) {
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Não deu para consultar a fila.");
      }

      if (data.matched && data.room?.code && data.user) {
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
      const response = await fetch(
        `/api/matchmaking?mode=${mode}&heartbeat=1&browserId=${encodeURIComponent(browserId)}`,
        { cache: "no-store" },
      );

      await handleResponse(response);
    }

    if (!hasJoinedQueueRef.current) {
      hasJoinedQueueRef.current = true;
      joinQueue().catch((caughtError) => {
        if (isActive) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Não deu para entrar na fila.",
          );
        }
      });
    }

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
              A sala abre automaticamente quando houver 4 jogadores prontos
              para o mesmo modo.
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
