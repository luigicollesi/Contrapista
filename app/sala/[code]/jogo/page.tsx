"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PLAYER_COLORS, type PlayerColor } from "@/lib/player-colors";

type RoomEvent =
  | {
      id: string;
      type: "solution" | "solution_correct";
      actorId: string;
      actorNickname: string;
      createdAt: number;
      guess?: string;
    }
  | {
      id: string;
      type: string;
      actorId: string;
      actorNickname: string;
      createdAt: number;
      guess?: string;
    };

type RoomConfig = {
  readingTimeSeconds: number;
  clueSelectionTimeSeconds: number;
  revealedClueAnalysisTimeSeconds: number;
  roundAnalysisTimeSeconds: number;
  finalGuessTimeSeconds: number;
  trueCluesPerPlayer: number;
  cluesPerPlayer: number;
};

type Room = {
  code: string;
  users: Array<{ id: string; nickname: string; color: PlayerColor; ready: boolean }>;
  activecase: string | null;
  activeevent: RoomEvent | null;
  gamestate: GameState | null;
  config: RoomConfig;
};

type GameState = {
  phase: "ready" | "reading" | "roulette" | "turn" | "shared_clue" | "pause";
  round: number;
  order: string[];
  currentTurnIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  roulettePool?: string[];
  rouletteSelectedId?: string;
  pausedAt?: number;
  readyUserIds?: string[];
  eliminatedUserIds?: string[];
  returnedToLobbyUserIds?: string[];
  skipVotes?: {
    phaseKey: string;
    userIds: string[];
  };
  sharedClueIds?: Record<string, string[]>;
  sharedClue?: {
    id: string;
    actorId: string;
    actorNickname: string;
    clueText: string;
    clueNumber: number;
    clueId?: string;
    autoShared?: boolean;
    createdAt: number;
  };
};

type GameCase = {
  id: string;
  title: string;
  case_text: string;
  final_answer: string;
  true_clues: string[];
  false_clues: string[];
};

type PlayerClue = {
  id: string;
  text: string;
  number: number;
};

type SavedSession = {
  roomCode: string;
  user: {
    id: string;
    nickname: string;
  };
};

const SESSION_STORAGE_KEY = "contrapista-session";

function leftCaseStorageKey(code: string) {
  return `contrapista-left-case-${code}`;
}

function getPlayerColorHex(color?: PlayerColor) {
  return color ? PLAYER_COLORS[color]?.hex ?? "#d7b861" : "#d7b861";
}

function getClueDistribution(config?: RoomConfig) {
  const cluesPerPlayer = Math.min(
    10,
    Math.max(2, Math.round(config?.cluesPerPlayer ?? 6)),
  );
  const trueCluesPerPlayer = Math.min(
    cluesPerPlayer,
    Math.max(0, Math.round(config?.trueCluesPerPlayer ?? 3)),
  );

  return {
    cluesPerPlayer,
    trueCluesPerPlayer,
    falseCluesPerPlayer: cluesPerPlayer - trueCluesPerPlayer,
  };
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

function pickClues({
  clues,
  start,
  count,
  prefix,
}: {
  clues: string[];
  start: number;
  count: number;
  prefix: string;
}): PlayerClue[] {
  return Array.from({ length: count })
    .map((_, index) => {
      const clue = clues[(start + index) % clues.length];

      return clue
        ? {
            id: `${prefix}-${start + index}`,
            text: clue,
            number: index + 1,
          }
        : null;
    })
    .filter((clue): clue is PlayerClue => Boolean(clue));
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
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [selectedClue, setSelectedClue] = useState<PlayerClue | null>(null);
  const [dismissedSharedClueId, setDismissedSharedClueId] = useState<string | null>(null);
  const [finalGuess, setFinalGuess] = useState("");
  const finalGuessRef = useRef("");
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, []);

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
              : "Não foi possível carregar o dossiê.",
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
  }, [code, gameCase, router]);

  const event = room?.activeevent ?? null;
  const modalEvent = event && event.type !== "solution_wrong" ? event : null;
  const isMissingGame =
    error === "Sala não encontrada." || error === "Caso não encontrado.";
  const playerClues = useMemo(() => {
    if (!gameCase || !room || !userId) {
      return [];
    }

    const userIndex = Math.max(
      0,
      room.users.findIndex((user) => user.id === userId),
    );
    const distribution = getClueDistribution(room.config);
    const trueStart = userIndex * distribution.trueCluesPerPlayer;
    const falseStart = userIndex * distribution.falseCluesPerPlayer;
    const trueClues = pickClues({
      clues: gameCase.true_clues,
      start: trueStart,
      count: distribution.trueCluesPerPlayer,
      prefix: "true",
    });
    const falseClues = pickClues({
      clues: gameCase.false_clues,
      start: falseStart,
      count: distribution.falseCluesPerPlayer,
      prefix: "false",
    });

    return seededShuffle(
      [...trueClues, ...falseClues],
      `${gameCase.id}:${userId}:player-clues`,
    ).map((clue, index) => ({ ...clue, number: index + 1 }));
  }, [gameCase, room, userId]);
  const gameState = room?.gamestate ?? null;
  const currentTurnUserId = gameState?.order[gameState.currentTurnIndex] ?? null;
  const currentTurnUser = room?.users.find((user) => user.id === currentTurnUserId);
  const isMyTurn =
    Boolean(userId) &&
    gameState?.phase === "turn" &&
    currentTurnUserId === userId &&
    !gameState.pausedAt;
  const mySharedClueIds = userId
    ? gameState?.sharedClueIds?.[userId] ?? []
    : [];
  const hasUnsharedClues = playerClues.some(
    (clue) => !mySharedClueIds.includes(clue.id),
  );

  const phaseRemainingSeconds = gameState?.pausedAt
    ? null
    : Math.max(0, Math.ceil(((gameState?.phaseEndsAt ?? now) - now) / 1000));
  const phaseLabel = gameState?.pausedAt
    ? "Jogo pausado"
    : gameState?.phase === "ready"
      ? "Preparação"
      : gameState?.phase === "reading"
        ? "Leitura inicial"
        : gameState?.phase === "roulette"
        ? "Sorteando ordem"
        : gameState?.phase === "turn"
          ? "Vez de compartilhar"
          : gameState?.phase === "shared_clue"
            ? "Pista compartilhada"
            : "Pausa para organizar";

  const gameStarted = Boolean(gameState && gameState.phase !== "ready");
  const readyUserIds = gameState?.readyUserIds ?? [];
  const currentPhaseKey = gameState
    ? `${gameState.phase}:${gameState.round}:${gameState.currentTurnIndex}:${gameState.phaseStartedAt}`
    : "";
  const skipVoteIds =
    gameState?.skipVotes?.phaseKey === currentPhaseKey
      ? gameState.skipVotes.userIds
      : [];
  const canSkipPhase = Boolean(
    userId &&
      gameStarted &&
      !gameState?.pausedAt &&
      (gameState?.phase === "reading" ||
        gameState?.phase === "pause" ||
        gameState?.phase === "shared_clue"),
  );
  const hasVotedToSkip = Boolean(userId && skipVoteIds.includes(userId));

  const isEliminated = Boolean(
    userId && gameState?.eliminatedUserIds?.includes(userId),
  );
  const finalGuessEvent = modalEvent?.type === "solution" ? modalEvent : null;
  const isGuessActor = Boolean(
    finalGuessEvent && userId && finalGuessEvent.actorId === userId,
  );
  const finalGuessDurationMs = (room?.config.finalGuessTimeSeconds ?? 30) * 1000;
  const guessRemainingSeconds = finalGuessEvent
    ? Math.max(
        0,
        Math.ceil((finalGuessEvent.createdAt + finalGuessDurationMs - now) / 1000),
      )
    : 0;

  async function postGameAction(path: "ready" | "skip") {
    if (!userId) {
      setError("Entre na sala novamente para continuar.");
      return;
    }

    setError("");

    try {
      const response = await fetch(`/api/rooms/${code}/game/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível atualizar o jogo.");
      }

      setRoom((current) =>
        current ? { ...current, gamestate: data.gamestate } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível atualizar o jogo.",
      );
    }
  }

  useEffect(() => {
    if (!finalGuessEvent || !isGuessActor) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void submitFinalGuess();
    }, Math.max(0, finalGuessEvent.createdAt + finalGuessDurationMs - Date.now()));

    return () => window.clearTimeout(timeout);
    // submitFinalGuess reads the latest textarea value from finalGuessRef at timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalGuessEvent?.id, finalGuessDurationMs, isGuessActor]);

  async function publishEvent(body: Record<string, unknown>) {
    if (!userId) {
      setError("Entre na sala novamente para interagir com o dossiê.");
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

    return data.event as RoomEvent;
  }

  async function openSolution() {
    setError("");

    try {
      finalGuessRef.current = "";
      setFinalGuess("");
      setIsSubmittingGuess(false);
      const event = await publishEvent({ type: "solution" });
      setRoom((current) =>
        current && event ? { ...current, activeevent: event } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível abrir a solução.",
      );
    }
  }

  async function shareClue(clue: PlayerClue) {
    if (!userId) {
      setError("Entre na sala novamente para compartilhar pistas.");
      return;
    }

    setError("");

    try {
      const response = await fetch(`/api/rooms/${code}/clues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          clueText: clue.text,
          clueNumber: clue.number,
          clueId: clue.id,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível compartilhar a pista.");
      }

      setSelectedClue(null);
      setRoom((current) =>
        current ? { ...current, gamestate: data.gamestate } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível compartilhar a pista.",
      );
    }
  }

  async function submitFinalGuess() {
    if (!finalGuessEvent || !isGuessActor || isSubmittingGuess) {
      return;
    }

    setError("");
    setIsSubmittingGuess(true);

    try {
      const event = await publishEvent({
        type: "solution_guess",
        guess: finalGuessRef.current,
      });
      setRoom((current) =>
        current && event ? { ...current, activeevent: event } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível enviar o palpite.",
      );
      setIsSubmittingGuess(false);
    }
  }

  async function backToLobby() {
    if (gameCase?.id) {
      localStorage.setItem(leftCaseStorageKey(code), gameCase.id);
    }

    try {
      await fetch(`/api/rooms/${code}/case/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch {
      // O marcador local impede que este jogador seja puxado de volta ao caso.
    }

    router.push(`/sala/${code}`);
  }

  function renderModal() {
    if (!modalEvent || !gameCase) {
      if (gameState?.phase === "roulette") {
        const pool = gameState.roulettePool ?? [];
        const selectedPlayer = room?.users.find(
          (user) => user.id === gameState.rouletteSelectedId,
        );
        const wheelPlayers = pool
          .map((playerId) => room?.users.find((user) => user.id === playerId))
          .filter((player): player is NonNullable<typeof player> => Boolean(player));
        const selectedIndex = Math.max(
          0,
          wheelPlayers.findIndex(
            (player) => player.id === gameState.rouletteSelectedId,
          ),
        );
        const segmentAngle = 360 / Math.max(1, wheelPlayers.length);
        const wheelStops = wheelPlayers
          .map((player, index) => {
            const start = index * segmentAngle;
            const end = (index + 1) * segmentAngle;

            return `${getPlayerColorHex(player.color)} ${start}deg ${end}deg`;
          })
          .join(", ");
        const targetRotation = 1440 - (selectedIndex * segmentAngle + segmentAngle / 2);

        return (
          <Modal>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
              Roleta de ordem
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
              Sorteando o próximo jogador
            </h2>
            <div className="mt-6 flex flex-col items-center gap-6">
              <div
                className="relative h-72 w-72 rounded-full border-4 border-[#d7b861] bg-[#0f120e] shadow-[0_0_34px_rgba(215,184,97,.28)]"
                style={{ "--target-rotation": `${targetRotation}deg` } as CSSProperties}
              >
                <div
                  className="roulette-wheel absolute inset-4 rounded-full border border-[#d7b861]/40"
                  style={{
                    background: `conic-gradient(from -90deg, ${wheelStops || "#d7b861 0deg 360deg"})`,
                  }}
                />
                <div className="absolute left-1/2 top-0 h-10 w-5 -translate-x-1/2 rounded-b-full bg-[#fff3cf] shadow-lg" />
                <div className="absolute inset-16 rounded-full border border-[#d7b861]/50 bg-[#171b16] shadow-inner" />
                <div className="absolute inset-0 flex items-center justify-center px-12 text-center">
                  <p className="font-serif text-2xl font-bold text-[#fff3cf]">
                    {selectedPlayer?.nickname ?? "Sorteando..."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {pool.map((playerId) => {
                  const player = room?.users.find((user) => user.id === playerId);
                  const isSelected = playerId === gameState.rouletteSelectedId;

                  return (
                    <span
                      className={`rounded-full border px-3 py-1 text-sm font-bold ${
                        isSelected
                          ? "border-[#d7b861] bg-[#d7b861] text-[#17130d]"
                          : "border-stone-700 bg-[#0f120e] text-stone-300"
                      }`}
                      key={playerId}
                    >
                      {player?.nickname ?? "Jogador"}
                    </span>
                  );
                })}
              </div>
            </div>
            <style jsx>{`
              @keyframes roulette-spin {
                0% {
                  transform: rotate(0deg);
                }
                100% {
                  transform: rotate(var(--target-rotation));
                }
              }

              .roulette-wheel {
                animation: roulette-spin 3s cubic-bezier(0.12, 0.78, 0.22, 1)
                  both;
              }
            `}</style>
          </Modal>
        );
      }

      if (gameState?.phase === "shared_clue" && gameState.sharedClue && dismissedSharedClueId !== gameState.sharedClue.id) {
        return (
          <Modal>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                  Pista compartilhada
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                  {gameState.sharedClue.actorNickname} abriu um fragmento
                </h2>
              </div>
              <button
                aria-label="Fechar fragmento compartilhado"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
                onClick={() => setDismissedSharedClueId(gameState.sharedClue?.id ?? null)}
                type="button"
              >
                X
              </button>
            </div>
            {gameState.sharedClue.autoShared ? (
              <p className="mt-5 rounded-lg border border-[#d7b861]/35 bg-[#2a2112] px-4 py-3 text-sm font-bold text-[#fff3cf]">
                O tempo de escolha foi excedido. Uma pista verdadeira foi compartilhada automaticamente.
              </p>
            ) : null}
            <p className="mt-5 whitespace-pre-line text-xl leading-9 text-stone-200">
              {gameState.sharedClue.clueText}
            </p>
            <p className="mt-5 text-sm font-semibold text-stone-400">
              O fragmento fecha quando o cronômetro chegar a zero.
            </p>
          </Modal>
        );
      }

      if (selectedClue) {
        return (
          <Modal>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                  Fragmento {String(selectedClue.number).padStart(2, "0")}
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                  Leitura privada
                </h2>
              </div>
              <button
                aria-label="Fechar"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
                onClick={() => setSelectedClue(null)}
                type="button"
              >
                X
              </button>
            </div>
            <p className="mt-5 whitespace-pre-line text-xl leading-9 text-stone-200">
              {selectedClue.text}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={
                  !isMyTurn ||
                  (mySharedClueIds.includes(selectedClue.id) && hasUnsharedClues)
                }
                onClick={() => shareClue(selectedClue)}
                type="button"
              >
                {mySharedClueIds.includes(selectedClue.id) && hasUnsharedClues
                  ? "Fragmento já compartilhado"
                  : "Compartilhar na rodada"}
              </button>
            </div>
          </Modal>
        );
      }

      return null;
    }

    if (modalEvent.type === "solution") {
      const isActor = modalEvent.actorId === userId;

      return (
        <Modal>
          {isActor ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                Palpite final
              </p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                Escreva sua tese
              </h2>
              <p className="mt-3 text-sm font-semibold text-stone-400">
                Envio automático em {String(guessRemainingSeconds).padStart(2, "0")}s.
              </p>
              <textarea
                className="mt-5 min-h-64 w-full rounded-lg border border-[#d7b861]/35 bg-[#0f120e] p-4 text-lg leading-8 text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-[#d7b861] focus:ring-4 focus:ring-[#d7b861]/20"
                disabled={isSubmittingGuess}
                onChange={(event) => {
                  finalGuessRef.current = event.target.value;
                  setFinalGuess(event.target.value);
                }}
                placeholder="Descreva culpado, método, motivo e as respostas centrais do caso."
                value={finalGuess}
              />
              <div className="mt-6 flex justify-end">
                <button
                  className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmittingGuess}
                  onClick={submitFinalGuess}
                  type="button"
                >
                  {isSubmittingGuess ? "Enviando" : "Enviar palpite"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                Palpite em curso
              </p>
              <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                {modalEvent.actorNickname} está registrando uma tese
              </h2>
              <p className="mt-5 text-lg leading-8 text-stone-300">
                O jogo está pausado até o envio ou fim do cronômetro.
              </p>
            </>
          )}
        </Modal>
      );
    }

    if (modalEvent.type !== "solution_correct") {
      return null;
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
          {gameCase.final_answer}
        </p>
        <div className="mt-6 flex justify-end">
          <button
            className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa]"
            onClick={backToLobby}
            type="button"
          >
            Voltar à ante-sala
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
            Dossiê não encontrado
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
    <main className="sy-theme relative min-h-screen overflow-hidden bg-[#10130f] px-4 py-6 text-stone-50 sm:px-6 sm:py-8 lg:px-8">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      {canSkipPhase ? (
        <button
          className="fixed right-4 top-4 z-[80] flex h-12 items-center gap-2 rounded-full border border-[#d7b861]/50 bg-[#d7b861] px-4 font-black text-[#17130d] shadow-2xl shadow-black/35 transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={hasVotedToSkip}
          onClick={() => postGameAction("skip")}
          title="Pular fase por consenso"
          type="button"
        >
          <span aria-hidden="true" className="text-lg">⏩</span>
          <span>{hasVotedToSkip ? "Aguardando" : "Pular"}</span>
          <span className="rounded-full bg-[#17130d]/15 px-2 py-0.5 text-xs">
            {skipVoteIds.length}/{room?.users.length ?? 0}
          </span>
        </button>
      ) : null}
      <section className="relative mx-auto w-full max-w-7xl">
        <header className="flex flex-col justify-between gap-5 border-b border-[#d7b861]/25 pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#c8a24a]">
              Investigação ativa
            </p>
            <h1 className="mt-2 font-serif text-4xl font-bold text-[#fff3cf] sm:text-5xl">
              Sala {code}
            </h1>
          </div>
          <div className="rounded-lg border border-[#d7b861]/40 bg-[#171b16] px-6 py-4 shadow-2xl shadow-black/25">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8a24a]">
              Cronômetro
            </p>
            <p className="mt-1 font-mono text-4xl font-bold text-[#fff3cf]">
              {phaseRemainingSeconds === null
                ? "--"
                : String(phaseRemainingSeconds).padStart(2, "0")}
            </p>
            <p className="mt-2 text-sm font-semibold text-stone-400">
              {phaseLabel}
            </p>
          </div>
        </header>

        {gameState && gameStarted ? (
          <section className="sticky top-2 z-20 mt-5 rounded-lg border border-[#d7b861]/35 bg-[#171b16]/95 p-4 shadow-2xl shadow-black/20 backdrop-blur">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                  Rodada {gameState.round}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-[#fff3cf]">
                  {phaseLabel}
                </h2>
                <p className="mt-1 text-sm text-stone-400">
                  {gameState.phase === "ready"
                    ? "Todos precisam confirmar prontidão para abrir o dossiê."
                    : gameState.phase === "turn"
                      ? `Vez de ${currentTurnUser?.nickname ?? "jogador"}`
                      : gameState.phase === "roulette"
                      ? "A ordem da rodada está sendo definida."
                      : gameState.phase === "shared_clue"
                        ? "Todos analisam o fragmento aberto."
                        : gameState.phase === "pause"
                          ? "Organizem hipóteses antes da próxima rodada."
                          : "Leiam o dossiê e seus fragmentos sem revelar conclusões."}
                </p>
              </div>
              {gameState.phase !== "roulette" ? (
                <div className="flex flex-wrap gap-2">
                  {gameState.order.map((playerId, index) => {
                    const player = room?.users.find((user) => user.id === playerId);
                    const isCurrent = index === gameState.currentTurnIndex;

                    return (
                      <span
                        className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                          isCurrent
                            ? "border-[#d7b861] bg-[#d7b861] text-[#17130d]"
                            : "border-stone-700 bg-[#0f120e] text-stone-300"
                        }`}
                        key={playerId}
                      >
                        {player?.nickname ?? "Jogador"}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {error ? (
          <p className="mt-6 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
            {error}
          </p>
        ) : null}

        {!gameCase && !error ? (
          <p className="mt-8 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-6 text-stone-300 shadow-2xl shadow-black/20">
            Carregando dossiê...
          </p>
        ) : null}

        {!gameStarted && gameCase && gameState?.phase === "ready" ? (
          <section className="mt-8 rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-5 shadow-2xl shadow-black lg:p-6/25">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
              Preparação da investigação
            </p>
            <h2 className="mt-2 font-serif text-4xl font-bold text-[#fff3cf]">
              Confirme presença para abrir o dossiê
            </h2>
            <p className="mt-3 max-w-2xl text-stone-300">
              A leitura inicial começa somente quando todos estiverem prontos.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {room?.users.map((user) => {
                const isReady = readyUserIds.includes(user.id);

                return (
                  <article
                    className="rounded-lg border bg-[#0f120e] p-4"
                    key={user.id}
                    style={{ borderColor: `${getPlayerColorHex(user.color)}66` }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-9 w-9 rounded-full border border-white/35"
                        style={{ backgroundColor: getPlayerColorHex(user.color) }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-[#fff3cf]">
                          {user.nickname}
                        </p>
                        <p className="text-sm text-stone-400">
                          {isReady ? "Pronto" : "Aguardando"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                className="h-12 rounded-lg bg-[#d7b861] px-6 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(userId && readyUserIds.includes(userId))}
                onClick={() => postGameAction("ready")}
                type="button"
              >
                {userId && readyUserIds.includes(userId)
                  ? "Prontidão confirmada"
                  : "Estou pronto"}
              </button>
            </div>
          </section>
        ) : null}

        {gameCase && gameStarted ? (
          <>
            <article className="mt-7 overflow-hidden rounded-lg border border-[#d7b861]/35 bg-[#171b16] shadow-2xl shadow-black/25">
              <div className="border-b border-[#d7b861]/25 bg-[#0f120e] px-6 py-4">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">
                  Dossiê principal
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
                    Fragmentos reservados
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    Fragmentos sob sua custódia
                  </h2>
                </div>
                <p className="text-sm text-stone-400">
                  A proporção entre fragmentos corretos e falsos segue a configuração da sala.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {playerClues.map((clue, index) => {
                  const wasShared = mySharedClueIds.includes(clue.id);

                  return (
                    <button
                      className={`relative min-h-48 rounded border p-5 text-left shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:rotate-0 ${
                        wasShared
                          ? "rotate-0 border-[#8b1e1e]/70 bg-[#c8b37d] text-[#4b3724] opacity-75"
                          : "rotate-[-1deg] border-[#d7b861]/35 bg-[#f2dfad] text-[#21170f] hover:border-[#8b1e1e]"
                      }`}
                      key={clue.id}
                      onClick={() => setSelectedClue(clue)}
                      type="button"
                    >
                      {wasShared ? (
                        <span className="absolute right-3 top-3 rounded-full border border-[#8b1e1e]/40 bg-[#8b1e1e] px-2 py-1 text-xs font-black uppercase tracking-[0.16em] text-white">
                          Compartilhada
                        </span>
                      ) : null}
                      <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#8b1e1e]">
                        {String(index + 1).padStart(2, "0")}
                      </p>
                      <p className="mt-5 line-clamp-4 text-lg leading-8">
                        {clue.text}
                      </p>
                      <span className="mt-5 inline-flex text-sm font-bold text-[#8b1e1e]">
                        {wasShared ? "Reabrir fragmento" : "Abrir fragmento"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {isEliminated ? (
              <section className="mt-8 rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-5 shadow-2xl shadow-black lg:p-6/20">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                  Fora da disputa
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                  Arquivo completo liberado
                </h2>
                <p className="mt-2 text-stone-400">
                  Seu palpite falhou. Você pode consultar todas as pistas e suas classificações.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-emerald-500/35 bg-[#0f120e] p-4">
                    <h3 className="font-bold text-emerald-300">Pistas verdadeiras</h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
                      {gameCase.true_clues.map((clue, index) => (
                        <li key={`true-${index}`}>{clue}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-red-500/35 bg-[#0f120e] p-4">
                    <h3 className="font-bold text-red-300">Pistas falsas</h3>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
                      {gameCase.false_clues.map((clue, index) => (
                        <li key={`false-${index}`}>{clue}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}

            {!isEliminated ? (
            <section className="mt-8 rounded-lg border border-[#8b1e1e]/50 bg-[#171b16] p-5 shadow-2xl shadow-black lg:p-6/20">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
                    Encerramento
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    Conclusão final
                  </h2>
                  <p className="mt-2 text-stone-400">
                    Abra somente quando estiver disposto a sustentar uma tese.
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
            ) : null}
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
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-5 text-stone-50 shadow-2xl sm:p-6">
        {children}
      </section>
    </div>
  );
}
