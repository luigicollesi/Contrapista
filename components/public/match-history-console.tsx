"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type SyntheticEvent,
} from "react";
import { withCsrfHeader } from "@/lib/client-http";
import type {
  MatchHistoryEntry,
  MatchHistoryParticipantSnapshot,
} from "@/lib/match-history";

type HistoryTab = "case" | "players" | "summary";
type ReportReason = "cheating" | "disruptive" | "inappropriate_name";

type FriendSummary = {
  friendshipId: string;
  userId: string;
  username: string;
};

type FriendsResponse = {
  dashboard?: {
    friends?: FriendSummary[];
  };
  error?: string;
  message?: string;
  ok?: boolean;
};

const reportReasons = [
  ["inappropriate_name", "Nome impróprio"],
  ["disruptive", "Jogo sujo"],
  ["cheating", "Trapaça"],
] as const satisfies Array<[ReportReason, string]>;

const tabs = [
  ["summary", "Resumo", "Resultado e respostas principais"],
  ["players", "Jogadores", "Participantes, perfil e pistas"],
  ["case", "Caso", "Dossiê, solução e pistas globais"],
] as const satisfies Array<[HistoryTab, string, string]>;

function formatDate(value: string | null) {
  if (!value) {
    return "Pendente";
  }

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function outcome(entry: MatchHistoryEntry) {
  if (!entry.finalized_at) {
    return {
      label: "Em andamento",
      summary: "A partida ainda não terminou.",
      className: "border-[#d0a85c]/35 bg-[#2a2112] text-[#f5e7bd]",
    };
  }

  if (entry.user_won) {
    return {
      label: "Vitória",
      summary: `${entry.winner_username ?? "Um jogador"} venceu a partida.`,
      className: "border-emerald-400/35 bg-emerald-950/35 text-emerald-100",
    };
  }

  return {
    label: "Derrota",
    summary: entry.winner_username
      ? `${entry.winner_username} venceu a partida.`
      : "A partida terminou sem vencedor.",
    className: "border-stone-600 bg-stone-900 text-stone-200",
  };
}

function winningGuessText(entry: MatchHistoryEntry) {
  if (!entry.finalized_at) {
    return "A partida ainda não terminou.";
  }

  return entry.winning_final_guess?.trim() || "A partida terminou sem vencedor.";
}

function achievementItems(participant: MatchHistoryParticipantSnapshot) {
  const achievements = participant.achievements;

  if (!achievements) {
    return [];
  }

  return [
    ["Partidas jogadas", achievements.total_matches_played],
    ["Ranqueadas jogadas", achievements.ranked_matches_played],
    ["Vitórias", achievements.total_matches_won],
    ["Vitórias ranqueadas", achievements.ranked_matches_won],
    ["Rating", achievements.ranked_rating],
    ["Desafios diários", achievements.daily_problems_solved],
  ] as const;
}

export function MatchHistoryConsole({
  entry,
}: {
  entry: MatchHistoryEntry;
}) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("summary");
  const [activeParticipantId, setActiveParticipantId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] =
    useState<MatchHistoryParticipantSnapshot | null>(null);
  const [reportReason, setReportReason] =
    useState<ReportReason>("inappropriate_name");
  const [reportJustification, setReportJustification] = useState("");
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [confirmingRemoveUserId, setConfirmingRemoveUserId] = useState<
    string | null
  >(null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const participantCloseTimerRef = useRef<number | null>(null);
  const result = outcome(entry);
  const friendshipByUserId = useMemo(
    () => new Map(friends.map((friend) => [friend.userId, friend])),
    [friends],
  );

  useEffect(() => {
    let ignore = false;
    const timeout = window.setTimeout(() => {
      fetch("/api/users/me/friends", { cache: "no-store" })
        .then((response) => response.json())
        .then((payload: FriendsResponse) => {
          if (!ignore && payload.ok !== false) {
            setFriends(payload.dashboard?.friends ?? []);
          }
        })
        .catch(() => undefined);
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (participantCloseTimerRef.current) {
        window.clearTimeout(participantCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeParticipantId) {
      return;
    }

    function closeFloatingPopover() {
      setActiveParticipantId(null);
      setConfirmingRemoveUserId(null);
    }

    window.addEventListener("resize", closeFloatingPopover);
    window.addEventListener("scroll", closeFloatingPopover);

    return () => {
      window.removeEventListener("resize", closeFloatingPopover);
      window.removeEventListener("scroll", closeFloatingPopover);
    };
  }, [activeParticipantId]);

  function openParticipantPopover(participantId: string) {
    clearParticipantCloseTimer();
    setActiveParticipantId(participantId);
  }

  function handleParticipantPointer(participantId: string) {
    openParticipantPopover(participantId);
  }

  function clearParticipantCloseTimer() {
    if (participantCloseTimerRef.current) {
      window.clearTimeout(participantCloseTimerRef.current);
      participantCloseTimerRef.current = null;
    }
  }

  function scheduleParticipantPopoverClose() {
    clearParticipantCloseTimer();
    participantCloseTimerRef.current = window.setTimeout(() => {
      setActiveParticipantId(null);
      setConfirmingRemoveUserId(null);
      participantCloseTimerRef.current = null;
    }, 180);
  }

  function sendFriendRequest(participant: MatchHistoryParticipantSnapshot) {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/users/me/friends", withCsrfHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: participant.username }),
        }));
        const payload = (await response.json().catch(() => ({}))) as FriendsResponse;

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? payload.message ?? "Pedido indisponível.");
        }

        setFriends(payload.dashboard?.friends ?? friends);
        setConfirmingRemoveUserId(null);
        setMessage(`Pedido enviado para ${participant.username}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Pedido indisponível.");
      }
    });
  }

  function removeFriend(friendship: FriendSummary) {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/users/me/friends/${friendship.friendshipId}?friendUserId=${encodeURIComponent(friendship.userId)}`,
          withCsrfHeader({ method: "DELETE" }),
        );
        const payload = (await response.json().catch(() => ({}))) as FriendsResponse;

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? payload.message ?? "Ação indisponível.");
        }

        setFriends(payload.dashboard?.friends ?? []);
        setConfirmingRemoveUserId(null);
        setMessage(`${friendship.username} saiu da sua rede.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ação indisponível.");
      }
    });
  }

  function submitReport(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reportTarget) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/users/me/reports", withCsrfHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            justification: reportJustification,
            matchId: entry.match_id,
            reason: reportReason,
            reportedUserId: reportTarget.userId,
            reportedUsername: reportTarget.username,
          }),
        }));
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          ok?: boolean;
        };

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? payload.message ?? "Denúncia indisponível.");
        }

        setReportTarget(null);
        setReportJustification("");
        setReportReason("inappropriate_name");
        setMessage("Denúncia registrada.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Denúncia indisponível.");
      }
    });
  }

  return (
    <main className="sy-theme match-history-page min-h-screen overflow-hidden bg-[#0e1111] px-4 py-5 text-stone-50 sm:px-6 lg:px-8">
      <section className="relative z-10 mx-auto max-w-7xl">
        <div className="relative overflow-hidden border-b border-[#d0a85c]/20 pb-5">
          <div className="absolute right-0 top-0 hidden h-28 w-28 overflow-hidden sm:block">
            <Image
              alt=""
              className="history-brand-mark h-full w-full object-contain"
              height={112}
              src="/contrapista-icon.png"
              width={112}
            />
          </div>
          <div className="flex flex-col gap-4 pr-0 sm:pr-32 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#d0a85c]">
                Histórico
              </p>
              <h1 className="mt-3 max-w-4xl font-serif text-4xl font-bold leading-tight text-[#f2e6c8] sm:text-6xl">
                {entry.case_title}
              </h1>
              <p className="mt-3 text-sm text-stone-400">
                Registrada em {formatDate(entry.created_at)}
              </p>
            </div>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#d0a85c]/35 px-4 text-xs font-black uppercase tracking-[0.16em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
              href="/perfil"
            >
              Perfil
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className={`max-w-xl rounded-full border px-4 py-2 text-xs ${result.className}`}>
            <span className="font-black uppercase tracking-[0.16em]">
              {result.label}
            </span>
            <span className="ml-2 opacity-85">{result.summary}</span>
          </div>
          <nav className="flex flex-wrap gap-2">
            {tabs.map(([id, label]) => (
              <button
                className={`h-9 rounded-full border px-4 text-xs font-black uppercase tracking-[0.16em] transition ${
                  activeTab === id
                    ? "border-[#d0a85c] bg-[#d0a85c] text-[#17130d] shadow-lg shadow-[#d0a85c]/20"
                    : "border-[#d0a85c]/20 bg-[#171a1a]/70 text-stone-300 hover:border-[#d0a85c]/55 hover:text-[#f5e7bd]"
                }`}
                key={id}
                onClick={() => setActiveTab(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-6">
          <div className="min-w-0">
            {message ? (
              <p className="mb-4 rounded-sm border border-[#d0a85c]/25 bg-[#2a2112] px-3 py-2 text-sm font-semibold text-[#f5e7bd]">
                {message}
              </p>
            ) : null}

            {activeTab === "summary" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Sua partida">
                  <dl className="grid gap-3 text-sm text-stone-300 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                        Resultado
                      </dt>
                      <dd className="mt-1 font-semibold text-[#f2e6c8]">
                        {result.label}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                        Participantes
                      </dt>
                      <dd className="mt-1 font-semibold text-[#f2e6c8]">
                        {entry.participants.length || "Sem snapshot"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                        Vencedor
                      </dt>
                      <dd className="mt-1 font-semibold text-[#f2e6c8]">
                        {entry.winner_username ?? "Sem vencedor"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                        Encerramento
                      </dt>
                      <dd className="mt-1 font-semibold text-[#f2e6c8]">
                        {formatDate(entry.finalized_at)}
                      </dd>
                    </div>
                  </dl>
                </Panel>
                <Panel title="Seu palpite">
                  <TextBlock>
                    {entry.user_final_guess?.trim() ||
                      "Você não enviou palpite nesta partida."}
                  </TextBlock>
                </Panel>
                <Panel title="Palpite vencedor">
                  <TextBlock>{winningGuessText(entry)}</TextBlock>
                </Panel>
                <Panel title="Solução oficial">
                  <TextBlock>{entry.official_final_answer}</TextBlock>
                </Panel>
              </div>
            ) : null}

            {activeTab === "players" ? (
              <div className="grid gap-4">
                {entry.participants.length ? (
                  <>
                    <Panel title="Jogadores" tight>
                      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
                        {entry.participants.map((participant) => {
                          const friendship = friendshipByUserId.get(participant.userId);
                          const isActive = activeParticipantId === participant.userId;

                          return (
                            <div
                              className="relative"
                              key={participant.userId}
                              onMouseEnter={() =>
                                handleParticipantPointer(participant.userId)
                              }
                              onMouseLeave={scheduleParticipantPopoverClose}
                            >
                              <button
                                className={`group flex h-12 w-full items-center justify-between gap-3 rounded-full border px-4 text-left transition ${
                                  isActive
                                    ? "border-[#d0a85c] bg-[#d0a85c]/15"
                                    : "border-[#d0a85c]/18 bg-[#171a1a]/78 hover:border-[#d0a85c]/45 hover:bg-[#d0a85c]/8"
                                }`}
                                onClick={() => {
                                  if (activeParticipantId === participant.userId) {
                                    setActiveParticipantId(null);
                                  } else {
                                    openParticipantPopover(participant.userId);
                                  }
                                  setConfirmingRemoveUserId(null);
                                  setMessage("");
                                }}
                                type="button"
                              >
                                <span className="min-w-0 truncate font-serif text-lg font-bold text-[#f2e6c8]">
                                  {participant.username}
                                </span>
                                <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em] text-[#d0a85c]">
                                  {participant.userId === entry.winner_user_id
                                    ? "Venceu"
                                    : friendship
                                      ? "Amigo"
                                      : `${participant.clues.length} pistas`}
                                </span>
                              </button>

                              {isActive ? (
                                <PlayerProfilePopover
                                  confirmingRemoveUserId={confirmingRemoveUserId}
                                  friendship={friendship}
                                  isCurrentUser={participant.userId === entry.user_id}
                                  isPending={isPending}
                                  onAddFriend={() => sendFriendRequest(participant)}
                                  onCancelRemove={() => setConfirmingRemoveUserId(null)}
                                  onReport={() => setReportTarget(participant)}
                                  onRequestRemove={() =>
                                    setConfirmingRemoveUserId(participant.userId)
                                  }
                                  onMouseEnter={clearParticipantCloseTimer}
                                  onMouseLeave={scheduleParticipantPopoverClose}
                                  onRemoveFriend={() => {
                                    if (friendship) {
                                      removeFriend(friendship);
                                    }
                                  }}
                                  participant={participant}
                                />
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </Panel>

                    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                      <Panel title="Palpites">
                        <div className="grid gap-3">
                          {entry.participants.map((participant) => (
                            <div
                              className="border-l border-[#d0a85c]/30 bg-[#171a1a]/72 px-3 py-2"
                              key={participant.userId}
                            >
                              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#d0a85c]">
                                {participant.username}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-300">
                                {participant.userFinalGuess?.trim() ||
                                  "Sem palpite registrado."}
                              </p>
                            </div>
                          ))}
                        </div>
                      </Panel>

                      <Panel title="Pistas por jogador">
                        <div className="grid gap-4">
                          {entry.participants.map((participant) => (
                            <section
                              className="rounded-sm border border-[#d0a85c]/14 bg-[#0e1111]/55 p-3"
                              key={participant.userId}
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="truncate font-serif text-xl font-bold text-[#f2e6c8]">
                                  {participant.username}
                                </h3>
                                <span className="rounded-full border border-[#d0a85c]/25 px-2 py-1 text-xs font-black text-[#d0a85c]">
                                  {participant.clues.length}
                                </span>
                              </div>
                              <div className="grid gap-2">
                                {participant.clues.length ? (
                                  participant.clues.map((clue) => (
                                    <p
                                      className={`border-l px-3 py-2 text-sm leading-6 text-stone-300 ${
                                        clue.isFalse
                                          ? "border-red-400/60 bg-red-950/18"
                                          : "border-emerald-400/60 bg-emerald-950/18"
                                      }`}
                                      key={clue.id}
                                    >
                                      <span
                                        className={`mr-2 font-mono text-xs font-black ${
                                          clue.isFalse
                                            ? "text-red-200"
                                            : "text-emerald-200"
                                        }`}
                                      >
                                        {clue.isFalse ? "F" : "V"}
                                        {clue.number}
                                      </span>
                                      {clue.text}
                                    </p>
                                  ))
                                ) : (
                                  <p className="border-l border-[#d0a85c]/30 px-3 py-2 text-sm text-stone-400">
                                    Sem pistas registradas.
                                  </p>
                                )}
                              </div>
                            </section>
                          ))}
                        </div>
                      </Panel>
                    </div>
                  </>
                ) : (
                  <Panel title="Participantes">
                    <p className="text-sm text-stone-400">
                      Esta partida não tem snapshot de participantes.
                    </p>
                  </Panel>
                )}
              </div>
            ) : null}

            {activeTab === "case" ? (
              <div className="grid gap-4">
                <Panel title="Caso da partida">
                  <TextBlock>{entry.case_text}</TextBlock>
                </Panel>
                <Panel title="Solução oficial">
                  <TextBlock>{entry.official_final_answer}</TextBlock>
                </Panel>
                <Panel title="Todas as pistas">
                  <div className="grid gap-3 xl:grid-cols-2">
                    <div className="grid gap-2">
                      {entry.true_clues.map((clue, index) => (
                        <p
                          className="border-l border-emerald-400/60 bg-emerald-950/20 px-3 py-2 text-sm leading-6 text-stone-300"
                          key={`${index}:${clue}`}
                        >
                          <span className="mr-2 font-mono text-xs font-black text-emerald-200">
                            V{index + 1}
                          </span>
                          {clue}
                        </p>
                      ))}
                    </div>
                    <div className="grid gap-2">
                      {entry.false_clues.map((clue, index) => (
                        <p
                          className="border-l border-red-400/60 bg-red-950/20 px-3 py-2 text-sm leading-6 text-stone-300"
                          key={`${index}:${clue}`}
                        >
                          <span className="mr-2 font-mono text-xs font-black text-red-200">
                            F{index + 1}
                          </span>
                          {clue}
                        </p>
                      ))}
                    </div>
                  </div>
                </Panel>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {reportTarget ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 px-4">
          <form
            className="w-full max-w-md rounded-sm border border-[#d0a85c]/35 bg-[#171a1a] p-5 text-stone-100 shadow-2xl shadow-black/50"
            onSubmit={submitReport}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
                  Denúncia
                </p>
                <h2 className="mt-2 font-serif text-2xl font-bold text-[#f2e6c8]">
                  {reportTarget.username}
                </h2>
              </div>
              <button
                className="h-9 w-9 rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
                onClick={() => setReportTarget(null)}
                type="button"
              >
                X
              </button>
            </div>
            <div className="mt-5 grid gap-2">
              {reportReasons.map(([id, label]) => (
                <label
                  className={`flex cursor-pointer items-center justify-between rounded-sm border px-3 py-3 text-sm font-semibold transition ${
                    reportReason === id
                      ? "border-[#d0a85c] bg-[#d0a85c]/15 text-[#f2e6c8]"
                      : "border-[#d0a85c]/20 bg-[#0e1111] text-stone-300"
                  }`}
                  key={id}
                >
                  {label}
                  <input
                    checked={reportReason === id}
                    className="accent-[#d0a85c]"
                    onChange={() => setReportReason(id)}
                    type="radio"
                  />
                </label>
              ))}
            </div>
            <textarea
              className="mt-4 min-h-28 w-full rounded-sm border border-[#d0a85c]/25 bg-[#0e1111] px-3 py-2 text-sm text-stone-100 outline-none focus:border-[#d0a85c]"
              maxLength={1200}
              onChange={(event) => setReportJustification(event.target.value)}
              placeholder="Descreva brevemente o que aconteceu."
              required
              value={reportJustification}
            />
            <button
              className="mt-4 h-11 w-full rounded-sm bg-[#d0a85c] px-4 text-sm font-black uppercase tracking-[0.16em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              Enviar denúncia
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function PlayerProfilePopover({
  confirmingRemoveUserId,
  friendship,
  isCurrentUser,
  isPending,
  onAddFriend,
  onCancelRemove,
  onMouseEnter,
  onMouseLeave,
  onReport,
  onRemoveFriend,
  onRequestRemove,
  participant,
}: {
  confirmingRemoveUserId: string | null;
  friendship: FriendSummary | undefined;
  isCurrentUser: boolean;
  isPending: boolean;
  onAddFriend: () => void;
  onCancelRemove: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onReport: () => void;
  onRemoveFriend: () => void;
  onRequestRemove: () => void;
  participant: MatchHistoryParticipantSnapshot;
}) {
  const isConfirmingRemove = confirmingRemoveUserId === participant.userId;
  const achievements = achievementItems(participant);

  return (
    <div
      className="player-profile-popover absolute left-0 top-full z-[80] mt-2 max-h-[min(28rem,calc(100vh-8rem))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-sm border border-[#d0a85c]/35 bg-[#121616] p-4 text-stone-100 shadow-2xl shadow-black/50 backdrop-blur sm:left-auto sm:right-0 sm:w-80"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {achievements.length ? (
        <div className="grid grid-cols-2 gap-2">
          {achievements.map(([label, value]) => (
            <div
              className="rounded-sm border border-[#d0a85c]/15 bg-[#171a1a] px-2.5 py-2"
              key={label}
            >
              <p className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">
                {label}
              </p>
              <p className="mt-1 text-lg font-black text-[#f2e6c8]">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-sm border border-[#d0a85c]/15 bg-[#171a1a] px-3 py-2 text-xs text-stone-400">
          Conquistas indisponíveis.
        </p>
      )}

      {!isCurrentUser ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <>
            {friendship ? (
              <>
                <button
                  className="rounded-full border border-red-400/40 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-950/30 disabled:opacity-60"
                  disabled={isPending}
                  onClick={onRequestRemove}
                  type="button"
                >
                  Desfazer amizade
                </button>
                {isConfirmingRemove ? (
                  <>
                    <button
                      className="rounded-full bg-red-400 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-red-950 transition hover:bg-red-300 disabled:opacity-60"
                      disabled={isPending}
                      onClick={onRemoveFriend}
                      type="button"
                    >
                      Confirmar
                    </button>
                    <button
                      className="rounded-full border border-stone-600 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-stone-300 transition hover:bg-white/5 disabled:opacity-60"
                      disabled={isPending}
                      onClick={onCancelRemove}
                      type="button"
                    >
                      Cancelar
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <button
                className="rounded-full border border-[#d0a85c]/40 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 disabled:opacity-60"
                disabled={isPending}
                onClick={onAddFriend}
                type="button"
              >
                Fazer amizade
              </button>
            )}
            <button
              className="rounded-full border border-red-400/40 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-950/30 disabled:opacity-60"
              disabled={isPending}
              onClick={onReport}
              type="button"
            >
              Denunciar
            </button>
          </>
        </div>
      ) : null}
    </div>
  );
}

function Panel({
  children,
  tight = false,
  title,
}: {
  children: React.ReactNode;
  tight?: boolean;
  title: string;
}) {
  return (
    <section className="rounded-sm border border-[#d0a85c]/20 bg-[#171a1a] shadow-2xl shadow-black/15">
      <div className="border-b border-[#d0a85c]/15 px-4 py-3">
        <h2 className="font-serif text-xl font-bold text-[#f2e6c8]">
          {title}
        </h2>
      </div>
      <div className={tight ? "" : "p-4"}>{children}</div>
    </section>
  );
}

function TextBlock({ children }: { children: React.ReactNode }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-7 text-stone-300">
      {children}
    </p>
  );
}
