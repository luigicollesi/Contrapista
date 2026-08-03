"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CaseCreationStatus } from "@/components/case-creation/case-creation-status";
import { LeaveRoomButton } from "@/components/rooms/leave-room-button";
import { readJsonResponse, withCsrfHeader } from "@/lib/client-http";
import { clearSession, readUserId } from "@/lib/client-session";

const steps = [
  "Reunindo depoimentos",
  "Catalogando suspeitos",
  "Verificando álibis",
  "Localizando contradições",
  "Cruzando pistas",
  "Separando falsas pistas",
  "Distribuindo fragmentos",
  "Criando charadas",
  "Escrevendo solução",
  "Lacrando o arquivo",
];

const BOARD_THREAD_OFFSET = { x: 1.5, y: 2 };

const boardPins = [
  { x: 18, y: 22, delay: "0s" },
  { x: 52, y: 14, delay: ".35s" },
  { x: 78, y: 38, delay: ".7s" },
  { x: 34, y: 74, delay: "1.05s" },
  { x: 70, y: 78, delay: "1.4s" },
  { x: 18, y: 58, delay: "1.75s" },
];

function pinPoint(index: number) {
  const pin = boardPins[index];

  return {
    x: pin.x + BOARD_THREAD_OFFSET.x,
    y: pin.y + BOARD_THREAD_OFFSET.y,
  };
}

function pinPath(indexes: number[]) {
  return indexes
    .map((index, pathIndex) => {
      const point = pinPoint(index);

      return `${pathIndex === 0 ? "M" : "L"}${point.x} ${point.y}`;
    })
    .join(" ");
}

const clueCards = [
  { label: "Depoimento", left: "7%", top: "6%", rotate: "-5deg" },
  { label: "Horário", left: "58%", top: "5%", rotate: "4deg" },
  { label: "Objeto", left: "63%", top: "67%", rotate: "-3deg" },
  { label: "Álibi", left: "8%", top: "72%", rotate: "5deg" },
];

const CASE_CREATION_FETCH_ATTEMPTS = 5;
const CASE_CREATION_RETRY_DELAY_MS = 2500;
const CASE_CREATION_NOTICE_KEY = "contrapista-case-creation-notice";

type RoomConfig = {
  timersEnabled: boolean;
  readingTimeSeconds: number;
  clueSelectionTimeSeconds: number;
  revealedClueAnalysisTimeSeconds: number;
  roundAnalysisTimeSeconds: number;
  finalGuessTimeSeconds: number;
  trueCluesPerPlayer: number;
  cluesPerPlayer: number;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatElapsedTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

async function readEstimatedCreationTime(code: string) {
  try {
    const response = await fetch(`/api/rooms/${code}/case/start`, {
      method: "GET",
    });

    if (!response.ok) {
      return null;
    }

    const data = await readJsonResponse<{ estimatedSeconds?: number | null }>(response);

    return typeof data.estimatedSeconds === "number"
      ? data.estimatedSeconds
      : null;
  } catch {
    return null;
  }
}

async function readCaseCreationRoomState(code: string) {
  const response = await fetch(`/api/rooms/${code}`, {
    cache: "no-store",
  });
  const data = await readJsonResponse<{
    room?: {
      activecase?: string | null;
      allReady?: boolean;
      config?: RoomConfig;
      mode?: "custom" | "casual" | "ranked";
      users?: Array<{ id: string }>;
    } | null;
    error?: string;
  }>(response, 160);

  if (!response.ok || !data.room) {
    throw new Error(data.error ?? "Não deu para abrir a sala.");
  }

  return data.room;
}

export default function CreatingCasePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const [error, setError] = useState("");
  const [retryNotice, setRetryNotice] = useState("");
  const [isLeaving, setIsLeaving] = useState(false);
  const [isCancelingCreation, setIsCancelingCreation] = useState(false);
  const [canCancelCreation, setCanCancelCreation] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);
  const isHeartbeatInFlightRef = useRef(false);
  const isWatchingRoomRef = useRef(false);
  const isCancelingCreationRef = useRef(false);
  const progress = ((stepIndex + 1) / steps.length) * 100;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % steps.length);
    }, 1700);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let isActive = true;

    readEstimatedCreationTime(code).then((seconds) => {
      if (isActive) {
        setEstimatedSeconds(seconds);
      }
    });

    return () => {
      isActive = false;
    };
  }, [code]);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const userId = readUserId(code);

    if (!userId) {
      return;
    }

    let isActive = true;

    async function heartbeat() {
      if (isHeartbeatInFlightRef.current) {
        return;
      }

      isHeartbeatInFlightRef.current = true;

      try {
        const response = await fetch(`/api/rooms/${code}/heartbeat`, withCsrfHeader({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        }));
        const data = await readJsonResponse<{
          room?: {
            activecase?: string | null;
            allReady?: boolean;
          } | null;
          error?: string;
        }>(response, 160);

        if (!isActive || !response.ok) {
          return;
        }

        if (data.room?.activecase) {
          router.replace(`/sala/${code}/jogo`);
          return;
        }

        if (
          data.room &&
          !data.room.activecase &&
          data.room.allReady === false &&
          !isCancelingCreationRef.current
        ) {
          const message =
            "A criação foi interrompida. A mesa voltou para a ante-sala.";
          sessionStorage.setItem(CASE_CREATION_NOTICE_KEY, message);
          router.replace(`/sala/${code}`);
        }
      } catch {
        // A criação em andamento lida com falhas de conexão no POST principal.
      } finally {
        isHeartbeatInFlightRef.current = false;
      }
    }

    void heartbeat();
    const interval = window.setInterval(() => {
      if (isActive) {
        void heartbeat();
      }
    }, 30_000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, router]);

  useEffect(() => {
    let isActive = true;

    async function watchRoomState() {
      if (isWatchingRoomRef.current) {
        return;
      }

      isWatchingRoomRef.current = true;

      try {
        const room = await readCaseCreationRoomState(code);

        if (!isActive) {
          return;
        }

        setCanCancelCreation(room.mode === "custom");

        if (room.activecase) {
          router.replace(`/sala/${code}/jogo`);
          return;
        }

        if (room.allReady === false && !isCancelingCreationRef.current) {
          const message =
            "A criação foi interrompida. A mesa voltou para a ante-sala.";
          sessionStorage.setItem(CASE_CREATION_NOTICE_KEY, message);
          router.replace(`/sala/${code}`);
        }
      } catch {
        // O POST principal ou o heartbeat mostram falhas relevantes ao usuário.
      } finally {
        isWatchingRoomRef.current = false;
      }
    }

    void watchRoomState();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void watchRoomState();
      }
    }, 2000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, router]);

  useEffect(() => {
    let isActive = true;

    async function startCaseCreation() {
      try {
        const userId = readUserId(code);

        if (!userId) {
          throw new Error("Volte para a ante-sala e tente novamente.");
        }

        const room = await readCaseCreationRoomState(code);

        if (!isActive) {
          return;
        }

        const leaderUserId = room.users?.[0]?.id;

        if (leaderUserId && leaderUserId !== userId) {
          setRetryNotice("Aguardando o líder iniciar o caso...");
          return;
        }

        let response: Response | null = null;

        for (
          let attempt = 1;
          attempt <= CASE_CREATION_FETCH_ATTEMPTS;
          attempt += 1
        ) {
          try {
            response = await fetch(`/api/rooms/${code}/case/start`, withCsrfHeader({
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ userId }),
            }));
            break;
          } catch (caughtError) {
            if (!isActive) {
              return;
            }

            if (
              !(caughtError instanceof TypeError) ||
              attempt === CASE_CREATION_FETCH_ATTEMPTS
            ) {
              throw new Error("A conexão caiu durante a criação. Tente novamente.");
            }

            setRetryNotice(
              `Conexão instável. Nova tentativa (${attempt + 1}/${CASE_CREATION_FETCH_ATTEMPTS})...`,
            );
            await wait(CASE_CREATION_RETRY_DELAY_MS);
          }
        }

        if (!response) {
          throw new Error("Não deu para continuar a criação.");
        }

        if (!isActive) {
          return;
        }

        setRetryNotice("");

        const data = await readJsonResponse<{ error?: string }>(response, 160);

        if (!response.ok) {
          throw new Error(data.error ?? "Não deu para criar o caso.");
        }

        router.replace(`/sala/${code}/jogo`);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        if (isCancelingCreationRef.current) {
          return;
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "A criação está indisponível agora. Tente mais tarde.";

        sessionStorage.setItem(
          CASE_CREATION_NOTICE_KEY,
          message || "A criação está indisponível agora. Tente mais tarde.",
        );

        setError(message);
        router.replace(`/sala/${code}`);
      }
    }

    startCaseCreation();

    return () => {
      isActive = false;
    };
  }, [code, router]);

  async function leaveRoom() {
    if (isLeaving) {
      return;
    }

    setIsLeaving(true);
    setError("");

    const userId = readUserId(code);

    try {
      if (userId) {
        await fetch(`/api/rooms/${code}/leave`, withCsrfHeader({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        }));
      }
    } finally {
      clearSession(code);
      router.replace("/");
    }
  }

  async function cancelCaseCreation() {
    if (isCancelingCreation) {
      return;
    }

    const userId = readUserId(code);

    if (!userId) {
      setError("Volte para a ante-sala e tente novamente.");
      return;
    }

    isCancelingCreationRef.current = true;
    setIsCancelingCreation(true);
    setError("");

    try {
      const response = await fetch(`/api/rooms/${code}/case/cancel`, withCsrfHeader({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      }));
      const data = await readJsonResponse<{ error?: string }>(response, 160);

      if (!response.ok) {
        throw new Error(data.error ?? "Não deu para cancelar a criação.");
      }

      sessionStorage.setItem(
        CASE_CREATION_NOTICE_KEY,
        "A criação foi cancelada. A mesa voltou para a ante-sala.",
      );
      router.replace(`/sala/${code}`);
    } catch (caughtError) {
      isCancelingCreationRef.current = false;
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para cancelar a criação.",
      );
      setIsCancelingCreation(false);
    }
  }

  return (
    <main className="sy-theme relative min-h-screen overflow-hidden bg-[#10130f] px-3 py-4 text-stone-50 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="case-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[#d7b861]/10 to-transparent" />
        <div className="case-fog case-fog-a absolute left-[-12%] top-[12%] h-40 w-[38rem] rotate-[-12deg] rounded-full border border-[#d7b861]/20" />
        <div className="case-fog case-fog-b absolute bottom-[10%] right-[-10%] h-56 w-[44rem] rotate-[10deg] rounded-full border border-[#8b1e1e]/25" />
        <div className="case-ticker absolute bottom-8 left-0 flex min-w-full gap-6 font-mono text-xs font-bold uppercase tracking-[0.32em] text-[#d7b861]/35">
          {Array.from({ length: 10 }).map((_, index) => (
            <span key={index}>Evidências em análise</span>
          ))}
        </div>
      </div>
      <section className="relative mx-auto grid w-full max-w-7xl items-center gap-6 sm:gap-8 lg:grid-cols-[.82fr_1.18fr] lg:gap-12">
        <div className="mx-auto w-full max-w-2xl lg:mx-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861] sm:text-sm sm:tracking-[0.32em]">
              Sala {code}
            </p>
            <LeaveRoomButton isLeaving={isLeaving} onClick={leaveRoom} />
            {canCancelCreation ? (
              <button
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-400/45 bg-red-950/35 px-3 py-2 text-xs font-bold text-red-100 shadow-lg shadow-black/20 transition hover:border-red-300 hover:bg-red-900/55 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
                disabled={isCancelingCreation}
                onClick={cancelCaseCreation}
                type="button"
              >
                {isCancelingCreation ? "Cancelando" : "Cancelar criação"}
              </button>
            ) : null}
          </div>
          <h1 className="mt-4 max-w-2xl font-serif text-3xl font-bold leading-tight text-[#fff3cf] sm:mt-5 sm:text-6xl">
            A mesa está consolidando um dossiê inédito.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-300 sm:mt-6 sm:text-lg sm:leading-8">
            A mesa está montando narrativa, pistas e solução. Isso pode levar
            alguns instantes.
          </p>

          <CaseCreationStatus
            elapsedSeconds={elapsedSeconds}
            estimatedSeconds={estimatedSeconds}
            formatElapsedTime={formatElapsedTime}
            progress={progress}
            retryNotice={retryNotice}
            stepIndex={stepIndex}
            steps={steps}
          />

          {error ? (
            <p className="mt-6 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
              {error}
            </p>
          ) : null}
        </div>

        <div className="relative min-h-[460px] w-full sm:min-h-[640px] lg:min-h-[640px]">
          <div className="case-board-glow absolute inset-x-4 top-0 h-28 rounded-full bg-[#d7b861]/20 blur-3xl sm:inset-x-14" />
          <div className="relative mx-auto flex min-h-[440px] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#d7b861]/40 bg-[#171b16] p-4 shadow-2xl shadow-black/40 sm:min-h-[640px] sm:p-6 lg:min-h-[640px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(215,184,97,.16),transparent_18%),radial-gradient(circle_at_80%_70%,rgba(139,30,30,.18),transparent_22%)]" />
            <div className="case-map-lines absolute inset-0 opacity-35" />
            <div className="case-scan-line absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#d7b861]/20 to-transparent" />
            <div className="relative z-10 flex items-center justify-between border-b border-[#d7b861]/25 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">
                  Case file
                </p>
                <p className="mt-1 font-mono text-sm text-stone-400">
                  #{code}-AI
                </p>
              </div>
              <div className="case-seal h-12 w-12 rounded-lg border border-[#d7b861]/40 bg-[#0f120e]" />
            </div>

            <div className="relative z-10 mt-5 overflow-hidden rounded-lg border border-stone-700 bg-[#0f120e] p-4 sm:p-5">
              <div className="absolute inset-x-0 top-0 h-16 animate-[pulse_1.6s_ease-in-out_infinite] bg-gradient-to-b from-[#d7b861]/25 to-transparent" />
              <div className="space-y-4">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div className="flex items-center gap-3" key={index}>
                    <span className="h-3 w-3 rounded-full bg-[#d7b861]" />
                    <span
                      className="h-3 rounded-full bg-stone-600"
                      style={{ width: `${42 + ((index * 17) % 44)}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-6 min-h-[300px] flex-1 overflow-hidden rounded-lg border border-[#d7b861]/30 bg-[#0f120e]/80 sm:min-h-[360px]">
              <svg
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <path
                  className="case-thread"
                  d={pinPath([0, 1, 2, 4, 3, 5, 0])}
                  fill="none"
                  pathLength={100}
                  stroke="#d7b861"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.35"
                />
                <path
                  className="case-thread case-thread-alt"
                  d={`${pinPath([0, 3])} ${pinPath([1, 3])} ${pinPath([2, 5])} ${pinPath([4, 1])}`}
                  fill="none"
                  pathLength={100}
                  stroke="#8b1e1e"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.1"
                />
                <path
                  className="case-thread case-thread-soft"
                  d={`${pinPath([5])} C32 32 52 44 ${pinPoint(2).x} ${pinPoint(2).y} ${pinPath([3])} C46 56 60 54 ${pinPoint(4).x} ${pinPoint(4).y}`}
                  fill="none"
                  pathLength={100}
                  stroke="#fff3cf"
                  strokeLinecap="round"
                  strokeWidth="0.75"
                />
              </svg>
              {boardPins.map((pin, index) => (
                <span
                  className="case-pin absolute z-20 h-4 w-4 rounded-full bg-[#d7b861] shadow-[0_0_18px_rgba(215,184,97,.75)]"
                  key={`${pin.x}-${pin.y}`}
                  style={{
                    left: `${pin.x}%`,
                    top: `${pin.y}%`,
                    animationDelay: pin.delay,
                  }}
                >
                  <span className="absolute inset-[-7px] rounded-full border border-[#d7b861]/45" />
                  <span className="sr-only">Ponto {index + 1}</span>
                </span>
              ))}
              {clueCards.map((card, index) => (
                <div
                  className="case-floating-card absolute z-30 w-28 rounded border border-[#d7b861]/35 bg-[#fff3cf] px-3 py-2 text-[#21170f] shadow-lg sm:w-32"
                  key={card.label}
                  style={{
                    left: card.left,
                    top: card.top,
                    rotate: card.rotate,
                    animationDelay: `${index * 0.45}s`,
                  }}
                >
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b1e1e]">
                    {card.label}
                  </p>
                  <div className="mt-1 h-1.5 w-16 rounded-full bg-[#6f5533]/35" />
                </div>
              ))}
            </div>

            <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["Álibi", "Ruído", "Rastro", "Versão"].map((label, index) => (
                <div
                  className="case-location-tile rounded-lg border border-stone-700 bg-[#0f120e] px-3 py-4"
                  key={label}
                  style={{ animationDelay: `${index * 0.22}s` }}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Pista
                  </p>
                  <p className="mt-1 font-bold text-stone-200">{label}</p>
                </div>
              ))}
            </div>

            <div className="absolute -bottom-5 left-1/2 h-10 w-52 -translate-x-1/2 rounded-full bg-black/30 blur-xl" />
          </div>
        </div>
      </section>
      <style jsx>{`
        @keyframes case-sweep {
          0% {
            transform: translateX(-120%) skewX(-10deg);
          }
          100% {
            transform: translateX(360%) skewX(-10deg);
          }
        }

        @keyframes case-fog {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(var(--case-rotate, 0deg));
            opacity: 0.35;
          }
          50% {
            transform: translate3d(26px, -18px, 0)
              rotate(var(--case-rotate, 0deg));
            opacity: 0.75;
          }
        }

        @keyframes case-ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @keyframes case-scan-line {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(620%);
          }
        }

        @keyframes case-seal {
          0%,
          100% {
            box-shadow: inset 0 0 0 1px rgba(215, 184, 97, 0.2),
              0 0 0 rgba(215, 184, 97, 0);
          }
          50% {
            box-shadow: inset 0 0 0 1px rgba(215, 184, 97, 0.55),
              0 0 24px rgba(215, 184, 97, 0.22);
          }
        }

        @keyframes case-thread {
          0% {
            stroke-dashoffset: 100;
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0.78;
          }
        }

        @keyframes case-pin {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.55);
          }
        }

        @keyframes case-floating-card {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes case-location-tile {
          0%,
          100% {
            border-color: rgba(68, 64, 60, 1);
          }
          50% {
            border-color: rgba(215, 184, 97, 0.85);
          }
        }

        .case-sweep {
          animation: case-sweep 4.8s linear infinite;
        }

        .case-fog {
          animation: case-fog 7s ease-in-out infinite;
        }

        .case-fog-a {
          --case-rotate: -12deg;
        }

        .case-fog-b {
          --case-rotate: 10deg;
          animation-delay: -2.5s;
        }

        .case-ticker {
          animation: case-ticker 24s linear infinite;
        }

        .case-board-glow {
          animation: case-floating-card 3.5s ease-in-out infinite;
        }

        .case-map-lines {
          background-image:
            linear-gradient(30deg, transparent 47%, rgba(215, 184, 97, 0.22) 49%, transparent 51%),
            linear-gradient(150deg, transparent 47%, rgba(139, 30, 30, 0.28) 49%, transparent 51%);
          background-size: 96px 96px;
        }

        .case-scan-line {
          animation: case-scan-line 3.2s ease-in-out infinite;
        }

        .case-seal {
          animation: case-seal 2.8s ease-in-out infinite;
        }

        .case-thread {
          filter: drop-shadow(0 0 5px rgba(215, 184, 97, 0.55));
          stroke-dasharray: 100;
          animation: case-thread 4.5s ease-in-out infinite;
        }

        .case-thread-alt {
          animation-delay: 1.2s;
          filter: drop-shadow(0 0 5px rgba(139, 30, 30, 0.65));
        }

        .case-thread-soft {
          animation-delay: 2s;
          filter: drop-shadow(0 0 4px rgba(255, 243, 207, 0.45));
        }

        .case-pin {
          animation: case-pin 2.4s ease-in-out infinite;
        }

        .case-floating-card {
          animation: case-floating-card 3.2s ease-in-out infinite;
        }

        .case-location-tile {
          animation: case-location-tile 2.2s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}
