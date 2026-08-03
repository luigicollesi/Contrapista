"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getPlayerName,
} from "@/components/game/display-utils";
import { FixedPhaseActions } from "@/components/game/fixed-phase-actions";
import { GamePhasePanel } from "@/components/game/game-phase-panel";
import {
  CaseDossier,
  EliminatedCluesArchive,
  EliminatedPlayerArchive,
  FinalSolutionSection,
  PlayerCluesSection,
  ReadyInvestigationSection,
} from "@/components/game/game-sections";
import {
  GameHeader,
  GameShell,
  LoadingDossierMessage,
  MissingGameScreen,
} from "@/components/game/game-shell";
import { PrivateClueModal } from "@/components/game/private-clue-modal";
import { RouletteModal } from "@/components/game/roulette-modal";
import { SharedClueModal } from "@/components/game/shared-clue-modal";
import {
  CorrectSolutionModal,
  FinalGuessModal,
  ManualReviewModal,
  NoWinnerSolutionModal,
  PendingSolutionModal,
  WrongSolutionModal,
} from "@/components/game/solution-modals";
import type { GameCase, GameState, PlayerClue, Room, RoomEvent } from "@/components/game/types";
import { readJsonResponse, requestJson, withCsrfHeader } from "@/lib/client-http";
import {
  clearSession,
  leftCaseStorageKey,
  readUserId,
} from "@/lib/client-session";

const EMPTY_USER_IDS: string[] = [];

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

function getPlayerCluesForUser({
  gameCase,
  room,
  userId,
}: {
  gameCase: GameCase;
  room: Room;
  userId: string;
}) {
  const playerCount = room.users.length;
  const userIndex = Math.max(
    0,
    room.users.findIndex((user) => user.id === userId),
  );

  if (playerCount <= 0) {
    return [];
  }

  const trueClues = gameCase.true_clues.map((text, index) => ({
    id: `true-${index}`,
    text,
  }));
  const falseClues = gameCase.false_clues.map((text, index) => ({
    id: `false-${index}`,
    text,
  }));
  const totalClues = trueClues.length + falseClues.length;
  const cluesPerPlayer = Math.floor(totalClues / playerCount);
  const usableClueCount = cluesPerPlayer * playerCount;
  const discardCount = totalClues - usableClueCount;
  const falseDiscardCount = Math.min(discardCount, falseClues.length);
  const trueDiscardCount = discardCount - falseDiscardCount;
  const keptFalseClues = falseClues.slice(0, falseClues.length - falseDiscardCount);
  const keptTrueClues = trueClues.slice(0, trueClues.length - trueDiscardCount);
  const distributedClues = seededShuffle(
    [...keptTrueClues, ...keptFalseClues],
    `${gameCase.id}:distributed-clues:${playerCount}`,
  );
  const playerClues = distributedClues.slice(
    userIndex * cluesPerPlayer,
    (userIndex + 1) * cluesPerPlayer,
  );

  return seededShuffle(
    playerClues,
    `${gameCase.id}:${userId}:player-clues`,
  ).map((clue, index) => ({ ...clue, number: index + 1 }));
}

export default function GamePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [gameCase, setGameCase] = useState<GameCase | null>(null);
  const [error, setError] = useState("");
  const [selectedClue, setSelectedClue] = useState<PlayerClue | null>(null);
  const [dismissedSharedClueId, setDismissedSharedClueId] = useState<string | null>(null);
  const [dismissedWrongEventId, setDismissedWrongEventId] = useState<string | null>(null);
  const [finalGuess, setFinalGuess] = useState("");
  const finalGuessRef = useRef("");
  const isHeartbeatInFlightRef = useRef(false);
  const isLoadingRoomRef = useRef(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setUserId(readUserId(code));
      setIsSessionLoaded(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [code]);

  useEffect(() => {
    if (!isSessionLoaded) {
      return;
    }

    let isActive = true;

    async function loadRoomAndCase() {
      if (isLoadingRoomRef.current) {
        return;
      }

      const currentUserId = userId;

      if (!currentUserId) {
        setError("Mesa em andamento. Aguarde o fim da partida.");
        return;
      }

      isLoadingRoomRef.current = true;

      try {
        const roomResponse = await fetch(`/api/rooms/${code}/sync`, withCsrfHeader({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUserId }),
        }));
        const roomData = await readJsonResponse<{
          room?: Room;
          error?: string;
        }>(roomResponse);

        if (!roomResponse.ok || !roomData.room) {
          throw new Error(roomData.error ?? "Sala não encontrada.");
        }

        if (!isActive) {
          return;
        }

        setRoom(roomData.room);

        if (
          !roomData.room.users.some((user) => user.id === currentUserId)
        ) {
          throw new Error(
            "Mesa em andamento. Aguarde o fim da partida.",
          );
        }

        if (!roomData.room.activecase) {
          router.replace(`/sala/${code}`);
          return;
        }

        if (!gameCase || gameCase.id !== roomData.room.activecase) {
          const caseResponse = await fetch(
            `/api/cases/${roomData.room.activecase}?roomCode=${encodeURIComponent(code)}&userId=${encodeURIComponent(currentUserId)}`,
            {
              cache: "no-store",
            },
          );
          const caseData = await readJsonResponse<{
            case?: GameCase;
            error?: string;
          }>(caseResponse);

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
              : "Não deu para carregar o dossiê.",
          );
        }
      } finally {
        isLoadingRoomRef.current = false;
      }
    }

    loadRoomAndCase();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadRoomAndCase();
      }
    }, 2000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, gameCase, isSessionLoaded, router, userId]);

  useEffect(() => {
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
        const data = await readJsonResponse<{ room?: Room }>(response);

        if (isActive && response.ok && data.room) {
          setRoom(data.room);
        }
      } catch {
        // A leitura periódica da sala mostra a falha quando necessário.
      } finally {
        isHeartbeatInFlightRef.current = false;
      }
    }

    void heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, userId]);

  const event = room?.activeevent ?? null;
  const modalEvent =
    event && !(event.type === "solution_wrong" && dismissedWrongEventId === event.id)
      ? event
      : null;
  const isMissingGame =
    error === "Sala não encontrada." || error === "Caso não encontrado.";
  const playerClues = useMemo(() => {
    if (!gameCase || !room || !userId) {
      return [];
    }

    return getPlayerCluesForUser({ gameCase, room, userId });
  }, [gameCase, room, userId]);
  const gameState = room?.gamestate ?? null;
  const eliminatedUserIds = gameState?.eliminatedUserIds ?? EMPTY_USER_IDS;
  const activeUsers = room?.users.filter(
    (user) => !eliminatedUserIds.includes(user.id),
  ) ?? [];
  const currentTurnUserId = gameState?.order[gameState.currentTurnIndex] ?? null;
  const phasePlayers = useMemo(
    () =>
      gameState?.order.map((playerId) => ({
        id: playerId,
        name: getPlayerName(room?.users.find((user) => user.id === playerId)),
      })) ?? [],
    [gameState?.order, room?.users],
  );
  const isMyTurn =
    userId !== null &&
    gameState?.phase === "turn" &&
    currentTurnUserId === userId &&
    !gameState.pausedAt &&
    !eliminatedUserIds.includes(userId);
  const mySharedClueIds = userId
    ? gameState?.sharedClueIds?.[userId] ?? []
    : [];
  const hasUnsharedClues = playerClues.some(
    (clue) => !mySharedClueIds.includes(clue.id),
  );

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
    userId !== null &&
      gameStarted &&
      !gameState?.pausedAt &&
      !eliminatedUserIds.includes(userId) &&
      (gameState?.phase === "reading" ||
        gameState?.phase === "pause" ||
        gameState?.phase === "shared_clue"),
  );
  const hasVotedToSkip = Boolean(userId && skipVoteIds.includes(userId));

  const isEliminated = Boolean(
    userId && eliminatedUserIds.includes(userId),
  );
  const finalGuessEvent = modalEvent?.type === "solution" ? modalEvent : null;
  const isGuessActor = Boolean(
    finalGuessEvent && userId && finalGuessEvent.actorId === userId,
  );
  const timersEnabled = room?.config?.timersEnabled ?? true;
  const finalGuessDurationMs = (room?.config?.finalGuessTimeSeconds ?? 30) * 1000;
  const finalGuessEndsAt = finalGuessEvent && timersEnabled
    ? finalGuessEvent.createdAt + finalGuessDurationMs
    : null;
  const phaseEndsAt =
    gameState?.pausedAt || !timersEnabled ? null : gameState?.phaseEndsAt ?? null;
  const fixedTimerEndsAt = finalGuessEndsAt ?? phaseEndsAt;
  const fixedTimerLabel = finalGuessEvent ? "Palpite final" : phaseLabel;
  const eliminatedClueGroups = useMemo(() => {
    if (!gameCase || !room) {
      return [];
    }

    return eliminatedUserIds
      .map((eliminatedUserId) => {
        const player = room.users.find((user) => user.id === eliminatedUserId);

        if (!player) {
          return null;
        }

        return {
          player,
          clues: getPlayerCluesForUser({
            gameCase,
            room,
            userId: eliminatedUserId,
          }),
        };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group));
  }, [eliminatedUserIds, gameCase, room]);

  async function postGameAction(path: "ready" | "skip") {
    if (!userId) {
      setError("Volte para a mesa para continuar.");
      return;
    }

    setError("");

    try {
      const data = await requestJson<{ gamestate: GameState }>(
        `/api/rooms/${code}/game/${path}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId }),
        },
        "Não deu para atualizar a partida.",
      );

      setRoom((current) =>
        current ? { ...current, gamestate: data.gamestate } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para atualizar a partida.",
      );
    }
  }

  useEffect(() => {
    if (!timersEnabled || !finalGuessEvent || !isGuessActor) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void submitFinalGuess();
    }, Math.max(0, finalGuessEvent.createdAt + finalGuessDurationMs - Date.now()));

    return () => window.clearTimeout(timeout);
    // submitFinalGuess reads the latest textarea value from finalGuessRef at timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalGuessEvent?.id, finalGuessDurationMs, isGuessActor, timersEnabled]);

  async function publishEvent(body: Record<string, unknown>) {
    if (!userId) {
      setError("Volte para a mesa para interagir.");
      return null;
    }

    const data = await requestJson<{ event: RoomEvent }>(
      `/api/rooms/${code}/events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, ...body }),
      },
      "Não deu para registrar a ação.",
    );

    return data.event;
  }

  async function openSolution() {
    if (isEliminated) {
      setError("Eliminados não podem dar palpite final.");
      return;
    }

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
          : "Não deu para abrir o palpite.",
      );
    }
  }

  async function shareClue(clue: PlayerClue) {
    if (!userId) {
      setError("Volte para a mesa para abrir pistas.");
      return;
    }

    if (isEliminated) {
      setError("Eliminados não podem abrir pistas.");
      return;
    }

    setError("");

    try {
      const data = await requestJson<{ gamestate: GameState }>(
        `/api/rooms/${code}/clues`,
        {
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
        },
        "Não deu para compartilhar a pista.",
      );

      setSelectedClue(null);
      setRoom((current) =>
        current ? { ...current, gamestate: data.gamestate } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para compartilhar a pista.",
      );
    }
  }

  async function submitFinalGuess() {
    if (!finalGuessEvent || !isGuessActor || isSubmittingGuess) {
      return;
    }

    setError("");
    setIsSubmittingGuess(true);
    const submittedGuess = finalGuessRef.current;

    setRoom((current) =>
      current
        ? {
            ...current,
            activeevent: {
              id: `${finalGuessEvent.id}:pending`,
              type: "solution_pending",
              actorId: finalGuessEvent.actorId,
              actorNickname: finalGuessEvent.actorNickname,
              guess: submittedGuess.trim(),
              createdAt: Date.now(),
            },
          }
        : current,
    );

    try {
      const event = await publishEvent({
        type: "solution_guess",
        guess: submittedGuess,
      });
      setRoom((current) =>
        current && event ? { ...current, activeevent: event } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para enviar o palpite.",
      );
      setIsSubmittingGuess(false);
    }
  }

  async function submitManualJudgement(correct: boolean) {
    setError("");

    try {
      const event = await publishEvent({
        type: "solution_manual_result",
        correct,
      });
      setRoom((current) =>
        current && event ? { ...current, activeevent: event } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para registrar sua avaliação.",
      );
    }
  }

  async function backToLobby() {
    if (gameCase?.id) {
      localStorage.setItem(leftCaseStorageKey(code), gameCase.id);
    }

    try {
      await fetch(`/api/rooms/${code}/case/return`, withCsrfHeader({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }));
    } catch {
      // O marcador local impede que este jogador seja puxado de volta ao caso.
    }

    router.push(`/sala/${code}`);
  }

  async function leaveRoom() {
    if (isLeaving) {
      return;
    }

    setIsLeaving(true);
    setError("");

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

  function renderModal() {
    if (!modalEvent || !gameCase) {
      if (gameState?.phase === "roulette") {
        return <RouletteModal gameState={gameState} room={room} />;
      }

      if (gameState?.phase === "shared_clue" && gameState.sharedClue && dismissedSharedClueId !== gameState.sharedClue.id) {
        return (
          <SharedClueModal
            hasTimer={timersEnabled}
            onClose={() =>
              setDismissedSharedClueId(gameState.sharedClue?.id ?? null)
            }
            sharedClue={gameState.sharedClue}
          />
        );
      }

      if (selectedClue) {
        const isAlreadySharedBlocked =
          mySharedClueIds.includes(selectedClue.id) && hasUnsharedClues;

        return (
          <PrivateClueModal
            canShare={isMyTurn && !isAlreadySharedBlocked}
            clue={selectedClue}
            isAlreadySharedBlocked={isAlreadySharedBlocked}
            onClose={() => setSelectedClue(null)}
            onShare={() => shareClue(selectedClue)}
          />
        );
      }

      return null;
    }

    if (modalEvent.type === "solution") {
      const isActor = modalEvent.actorId === userId;

      return (
        <FinalGuessModal
          event={modalEvent}
          finalGuess={finalGuess}
          guessEndsAt={finalGuessEndsAt}
          isActor={isActor}
          isSubmittingGuess={isSubmittingGuess}
          onChangeGuess={(value) => {
            finalGuessRef.current = value;
            setFinalGuess(value);
          }}
          onSubmit={submitFinalGuess}
        />
      );
    }

    if (modalEvent.type === "solution_pending") {
      return <PendingSolutionModal event={modalEvent} />;
    }

    if (modalEvent.type === "solution_manual_review") {
      const isActor = modalEvent.actorId === userId;

      return (
        <ManualReviewModal
          event={modalEvent}
          finalAnswer={gameCase.final_answer}
          isActor={isActor}
          onJudge={submitManualJudgement}
        />
      );
    }

    if (modalEvent.type === "solution_wrong") {
      return (
        <WrongSolutionModal
          event={modalEvent}
          onClose={() => setDismissedWrongEventId(modalEvent.id)}
        />
      );
    }

    if (modalEvent.type === "solution_no_winner") {
      return (
        <NoWinnerSolutionModal
          finalAnswer={gameCase.final_answer}
          onBackToLobby={backToLobby}
        />
      );
    }

    if (modalEvent.type !== "solution_correct") {
      return null;
    }

    return (
      <CorrectSolutionModal
        event={modalEvent}
        finalAnswer={gameCase.final_answer}
        onBackToLobby={backToLobby}
      />
    );
  }

  if (isMissingGame) {
    return <MissingGameScreen code={code} />;
  }

  return (
    <GameShell>
      {gameState && gameStarted ? (
        <FixedPhaseActions
          activeUserCount={activeUsers.length}
          canSkipPhase={canSkipPhase}
          hasVotedToSkip={hasVotedToSkip}
          onSkip={() => postGameAction("skip")}
          skipVoteCount={skipVoteIds.length}
          timerEndsAt={fixedTimerEndsAt}
          timerLabel={fixedTimerLabel}
        />
      ) : null}
      <section className="relative mx-auto w-full max-w-7xl">
        <GameHeader code={code} isLeaving={isLeaving} onLeave={leaveRoom} />

        {gameState && gameStarted ? (
          <GamePhasePanel
            currentTurnIndex={gameState.currentTurnIndex}
            phase={gameState.phase}
            phaseLabel={phaseLabel}
            players={phasePlayers}
            round={gameState.round}
          />
        ) : null}

        {error ? (
          <p className="mt-6 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
            {error}
          </p>
        ) : null}

        {!gameCase && !error ? (
          <LoadingDossierMessage />
        ) : null}

        {!gameStarted && gameCase && gameState?.phase === "ready" ? (
          <ReadyInvestigationSection
            currentUserId={userId}
            onReady={() => postGameAction("ready")}
            readyUserIds={readyUserIds}
            users={room?.users ?? []}
          />
        ) : null}

        {gameCase && gameStarted ? (
          <>
            <CaseDossier gameCase={gameCase} />

            {!isEliminated ? (
              <PlayerCluesSection
                clues={playerClues}
                onSelectClue={setSelectedClue}
                sharedClueIds={mySharedClueIds}
              />
            ) : null}

            {!isEliminated && eliminatedClueGroups.length > 0 ? (
              <EliminatedCluesArchive groups={eliminatedClueGroups} />
            ) : null}

            {isEliminated ? (
              <EliminatedPlayerArchive gameCase={gameCase} />
            ) : null}

            {!isEliminated ? (
              <FinalSolutionSection onOpen={openSolution} />
            ) : null}
          </>
        ) : null}
      </section>
      {renderModal()}
    </GameShell>
  );
}
