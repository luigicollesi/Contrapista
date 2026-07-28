"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CASE_LOCATIONS,
  type CaseLocationKey,
} from "@/lib/case-locations";

type RoomEvent =
  | {
      id: string;
      type: "clue";
      actorId: string;
      actorNickname: string;
      clueKey: CaseLocationKey;
      locationName: string;
      createdAt: number;
    }
  | {
      id: string;
      type: "solution" | "solution_correct";
      actorId: string;
      actorNickname: string;
      createdAt: number;
    };

type Room = {
  code: string;
  users: Array<{ id: string; nickname: string }>;
  activecase: string | null;
  activeevent: RoomEvent | null;
};

type GameCase = {
  id: string;
  title: string;
  case_text: string;
  final_solution: string;
} & Record<CaseLocationKey, string>;

type SavedSession = {
  roomCode: string;
  user: {
    id: string;
    nickname: string;
  };
};

const SESSION_STORAGE_KEY = "scotland-yard-session";

function dismissedEventsStorageKey(code: string, userId: string | null) {
  return `scotland-yard-dismissed-events-${code}-${userId ?? "guest"}`;
}

function readUserId(code: string) {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const session = JSON.parse(stored) as SavedSession;

    return session.roomCode === code ? session.user.id : null;
  } catch {
    return null;
  }
}

function readDismissedEventIds(code: string, userId: string | null) {
  try {
    const stored = localStorage.getItem(dismissedEventsStorageKey(code, userId));

    if (!stored) {
      return new Set<string>();
    }

    const ids = JSON.parse(stored) as unknown;

    return Array.isArray(ids)
      ? new Set(ids.filter((id): id is string => typeof id === "string"))
      : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function saveDismissedEventIds(
  code: string,
  userId: string | null,
  ids: Set<string>,
) {
  localStorage.setItem(
    dismissedEventsStorageKey(code, userId),
    JSON.stringify(Array.from(ids).slice(-50)),
  );
}

export default function GamePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const [userId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return readUserId(code);
  });
  const [room, setRoom] = useState<Room | null>(null);
  const [gameCase, setGameCase] = useState<GameCase | null>(null);
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(
    () => {
      if (typeof window === "undefined") {
        return new Set();
      }

      return readDismissedEventIds(code, readUserId(code));
    },
  );
  const [lockedTimedEvent, setLockedTimedEvent] = useState<RoomEvent | null>(
    null,
  );
  const [queuedEvent, setQueuedEvent] = useState<RoomEvent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadRoomAndCase() {
      try {
        const roomResponse = await fetch(`/api/rooms/${code}`, {
          cache: "no-store",
        });
        const roomData = (await roomResponse.json()) as {
          room?: Room;
          error?: string;
        };

        if (!roomResponse.ok || !roomData.room) {
          throw new Error(roomData.error ?? "Sala não encontrada.");
        }

        if (!isActive) {
          return;
        }

        const nextEvent = roomData.room.activeevent;
        const isLockedOwnClue =
          lockedTimedEvent?.type === "clue" &&
          lockedTimedEvent.actorId === userId;

        if (nextEvent && !dismissedEventIds.has(nextEvent.id)) {
          if (isLockedOwnClue && nextEvent.id !== lockedTimedEvent?.id) {
            setQueuedEvent((current) => current ?? nextEvent);
          } else if (
            nextEvent.type === "clue" &&
            nextEvent.actorId === userId &&
            nextEvent.id !== lockedTimedEvent?.id
          ) {
            setLockedTimedEvent(nextEvent);
            setQueuedEvent(null);
          }
        }

        setRoom(roomData.room);

        if (!roomData.room.activecase) {
          router.replace(`/sala/${code}`);
          return;
        }

        if (!gameCase || gameCase.id !== roomData.room.activecase) {
          const caseResponse = await fetch(
            `/api/cases/${roomData.room.activecase}`,
            {
              cache: "no-store",
            },
          );
          const caseData = (await caseResponse.json()) as {
            case?: GameCase;
            error?: string;
          };

          if (!isActive) {
            return;
          }

          if (!caseResponse.ok || !caseData.case) {
            throw new Error(caseData.error ?? "Caso não encontrado.");
          }

          setGameCase(caseData.case);
        }
      } catch (caughtError) {
        if (isActive) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Não foi possível carregar o jogo.",
          );
        }
      }
    }

    loadRoomAndCase();
    const interval = window.setInterval(loadRoomAndCase, 2000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, dismissedEventIds, gameCase, lockedTimedEvent, router, userId]);

  const event = room?.activeevent ?? null;
  const visibleEvent = lockedTimedEvent ?? queuedEvent ?? event;
  const modalEvent =
    visibleEvent && !dismissedEventIds.has(visibleEvent.id)
      ? visibleEvent
      : null;
  const isMissingGame =
    error === "Sala não encontrada." || error === "Caso não encontrado.";

  const dismissEvent = useCallback((eventId: string) => {
    setDismissedEventIds((current) => {
      const next = new Set(current);
      next.add(eventId);
      saveDismissedEventIds(code, userId, next);
      return next;
    });

    setQueuedEvent((current) => (current?.id === eventId ? null : current));
    setLockedTimedEvent((current) =>
      current?.id === eventId ? null : current,
    );
  }, [code, userId]);

  async function publishEvent(body: Record<string, unknown>) {
    if (!userId) {
      setError("Entre na sala novamente para interagir com o jogo.");
      return null;
    }

    const response = await fetch(`/api/rooms/${code}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, ...body }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Não foi possível publicar evento.");
    }

    setDismissedEventIds((current) => {
      const next = new Set(current);
      next.delete(data.event.id);
      saveDismissedEventIds(code, userId, next);
      return next;
    });

    return data.event as RoomEvent;
  }

  async function openClue(clueKey: CaseLocationKey) {
    setError("");

    try {
      const event = await publishEvent({ type: "clue", clueKey });

      if (event?.type === "clue" && event.actorId === userId) {
        setLockedTimedEvent(event);
        setQueuedEvent(null);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível abrir a dica.",
      );
    }
  }

  async function openSolution() {
    setError("");

    try {
      await publishEvent({ type: "solution" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível abrir a solução.",
      );
    }
  }

  async function markCorrect() {
    setError("");

    try {
      await publishEvent({ type: "solution_correct" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível confirmar a resposta.",
      );
    }
  }

  async function backToLobby() {
    await fetch(`/api/rooms/${code}/case/finish`, {
      method: "POST",
    });
    router.push(`/sala/${code}`);
  }

  function renderModal() {
    if (!modalEvent || !gameCase) {
      return null;
    }

    if (modalEvent.type === "clue") {
      const isActor = modalEvent.actorId === userId;
      const clueText = gameCase[modalEvent.clueKey];

      return (
        <Modal>
          {isActor ? (
            <TimedClueModal
              clueText={clueText}
              locationName={modalEvent.locationName}
              onDone={() => dismissEvent(modalEvent.id)}
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                    Dica consultada
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    {modalEvent.actorNickname} abriu uma pista
                  </h2>
                </div>
                <button
                  aria-label="Fechar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
                  onClick={() => dismissEvent(modalEvent.id)}
                  type="button"
                >
                  X
                </button>
              </div>
              <p className="mt-5 text-lg leading-8 text-stone-300">
                Local: <strong>{modalEvent.locationName}</strong>.
              </p>
            </>
          )}
        </Modal>
      );
    }

    if (modalEvent.type === "solution") {
      const isActor = modalEvent.actorId === userId;

      return (
        <Modal>
          {isActor ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                Solução final
              </p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                Confira sua resposta
              </h2>
              <p className="mt-5 whitespace-pre-line text-lg leading-8 text-stone-300">
                {gameCase.final_solution}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  className="h-11 rounded-lg border border-stone-600 px-5 font-semibold text-stone-100 transition hover:bg-white/10"
                  onClick={() => dismissEvent(modalEvent.id)}
                  type="button"
                >
                  Errou
                </button>
                <button
                  className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa]"
                  onClick={markCorrect}
                  type="button"
                >
                  Acertou
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                    Solução consultada
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    {modalEvent.actorNickname} abriu a resposta final
                  </h2>
                </div>
                <button
                  aria-label="Fechar"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
                  onClick={() => dismissEvent(modalEvent.id)}
                  type="button"
                >
                  X
                </button>
              </div>
              <p className="mt-5 text-lg leading-8 text-stone-300">
                Aguarde a confirmação de acerto ou erro desse jogador.
              </p>
            </>
          )}
        </Modal>
      );
    }

    return (
      <Modal>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
          Caso encerrado
        </p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
          Resposta correta
        </h2>
        <p className="mt-3 text-stone-400">
          {modalEvent.actorNickname} confirmou a solução do caso.
        </p>
        <p className="mt-5 whitespace-pre-line text-lg leading-8 text-stone-300">
          {gameCase.final_solution}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa]"
            onClick={backToLobby}
            type="button"
          >
            Voltar ao lobby
          </button>
        </div>
      </Modal>
    );
  }

  if (isMissingGame) {
    return (
      <main className="sy-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-[#10130f] px-6 py-10 text-stone-50">
        <div className="absolute inset-0 opacity-20">
          <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
        </div>
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#8b1e1e]/35 to-transparent" />

        <section className="relative w-full max-w-xl rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-8 text-center shadow-2xl shadow-black/30">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#d7b861]">
            Sala {code}
          </p>
          <h1 className="mt-4 font-serif text-5xl font-bold text-[#fff3cf]">
            Jogo não encontrado
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-7 text-stone-300">
            A sala ou o caso ativo não está mais disponível. Volte ao início
            para criar uma nova sala ou entrar com outro código.
          </p>
          <Link
            className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-[#d7b861] px-6 font-bold text-[#17130d] transition hover:bg-[#f3dfaa]"
            href="/"
          >
            Voltar ao início
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="sy-theme relative min-h-screen overflow-hidden bg-[#10130f] px-6 py-8 text-stone-50">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <section className="relative mx-auto w-full max-w-6xl">
        <header className="flex flex-col justify-between gap-5 border-b border-[#d7b861]/25 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#c8a24a]">
              Investigação ativa
            </p>
            <h1 className="mt-2 font-serif text-5xl font-bold text-[#fff3cf]">
              Sala {code}
            </h1>
          </div>
          <div className="rounded-lg border border-[#d7b861]/40 bg-[#171b16] px-6 py-4 shadow-2xl shadow-black/25">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8a24a]">
              Pistas
            </p>
            <p className="mt-1 font-mono text-4xl font-bold text-[#fff3cf]">
              14
            </p>
          </div>
        </header>

        {error ? (
          <p className="mt-6 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
            {error}
          </p>
        ) : null}

        {!gameCase && !error ? (
          <p className="mt-8 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-6 text-stone-300 shadow-2xl shadow-black/20">
            Carregando caso...
          </p>
        ) : null}

        {gameCase ? (
          <>
            <article className="mt-8 overflow-hidden rounded-lg border border-[#d7b861]/35 bg-[#171b16] shadow-2xl shadow-black/25">
              <div className="border-b border-[#d7b861]/25 bg-[#0f120e] px-6 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">
                  Arquivo principal
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                  {gameCase.title}
                </h2>
              </div>
              <div className="px-6 py-6">
                <div className="max-w-4xl whitespace-pre-line text-lg leading-8 text-stone-300">
                  {gameCase.case_text}
                </div>
              </div>
            </article>

            <section className="mt-8">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                    Locais
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    Escolha uma pista
                  </h2>
                </div>
                <p className="text-sm text-stone-400">
                  Cada pista abre por 30 segundos para quem consultou.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {CASE_LOCATIONS.map((location, index) => (
                  <button
                    className="group min-h-24 rounded-lg border border-stone-700 bg-[#171b16] px-4 py-4 text-left shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-[#d7b861] hover:bg-[#20251d]"
                    key={location.key}
                    onClick={() => openClue(location.key)}
                    type="button"
                  >
                    <span className="font-mono text-xs font-bold text-[#d7b861]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-3 block text-lg font-bold text-[#fff3cf]">
                      {location.name}
                    </span>
                    <span className="mt-2 block text-sm text-stone-400 transition group-hover:text-stone-300">
                      Abrir pista
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-8 rounded-lg border border-[#8b1e1e]/50 bg-[#171b16] p-6 shadow-2xl shadow-black/20">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                    Encerramento
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    Solução final
                  </h2>
                  <p className="mt-2 text-stone-400">
                    Abra somente quando estiver pronto para responder.
                  </p>
                </div>
                <button
                  className="h-12 rounded-lg bg-[#8b1e1e] px-6 font-bold text-white transition hover:bg-[#a32929]"
                  onClick={openSolution}
                  type="button"
                >
                  Revelar solução
                </button>
              </div>
            </section>
          </>
        ) : null}
      </section>
      {renderModal()}
    </main>
  );
}

function Modal({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-6 text-stone-50 shadow-2xl">
        {children}
      </section>
    </div>
  );
}

function TimedClueModal({
  clueText,
  locationName,
  onDone,
}: {
  clueText: string;
  locationName: string;
  onDone: () => void;
}) {
  const [seconds, setSeconds] = useState(30);
  const progress = (seconds / 30) * 100;
  const isUrgent = seconds <= 10;

  useEffect(() => {
    if (seconds <= 0) {
      onDone();
      return;
    }

    const timeout = window.setTimeout(() => {
      setSeconds((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [onDone, seconds]);

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            {locationName}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
            Dica aberta
          </h2>
        </div>
        <button
          aria-label="Fechar dica"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
          onClick={onDone}
          type="button"
        >
          X
        </button>
      </div>

      <div
        className={`mt-6 rounded-lg border p-4 ${
          isUrgent
            ? "border-red-400/50 bg-red-950/35"
            : "border-[#d7b861]/35 bg-[#0f120e]"
        }`}
      >
        <div className="flex items-center justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
              Tempo de leitura
            </p>
            <p className="mt-1 text-sm text-stone-400">
              O modal fecha quando o contador zerar.
            </p>
          </div>
          <div
            className={`clue-timer-pulse flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 font-mono text-3xl font-black ${
              isUrgent
                ? "border-red-400 bg-red-600 text-white shadow-[0_0_28px_rgba(248,113,113,.45)]"
                : "border-[#d7b861] bg-[#d7b861] text-[#17130d] shadow-[0_0_24px_rgba(215,184,97,.35)]"
            }`}
            key={seconds}
          >
            {seconds}
          </div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/35">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
              isUrgent ? "bg-red-400" : "bg-[#d7b861]"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="mt-5 text-lg leading-8 text-stone-300">{clueText}</p>
      <style jsx>{`
        @keyframes clue-timer-pulse {
          0% {
            transform: scale(1);
          }
          35% {
            transform: scale(1.14);
          }
          100% {
            transform: scale(1);
          }
        }

        .clue-timer-pulse {
          animation: clue-timer-pulse 0.45s ease-out;
        }
      `}</style>
    </>
  );
}
