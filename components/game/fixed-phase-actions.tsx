"use client";

import { formatTimer } from "@/components/game/display-utils";
import { useCountdownSeconds } from "@/components/game/use-countdown-seconds";

type FixedPhaseActionsProps = {
  activeUserCount: number;
  canSkipPhase: boolean;
  hasVotedToSkip: boolean;
  onSkip: () => void;
  skipVoteCount: number;
  timerEndsAt: number | null;
  timerLabel: string;
};

export function FixedPhaseActions({
  activeUserCount,
  canSkipPhase,
  hasVotedToSkip,
  onSkip,
  skipVoteCount,
  timerEndsAt,
  timerLabel,
}: FixedPhaseActionsProps) {
  const timerSeconds = useCountdownSeconds(timerEndsAt);
  const hasTimer = timerEndsAt !== null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[90] flex max-w-[calc(100vw-1.5rem)] items-center justify-end gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:max-w-[calc(100vw-2rem)]">
      <div className="rounded-full border border-[#d7b861]/45 bg-[#171b16]/95 px-3 py-2 text-right shadow-2xl shadow-black/35 backdrop-blur sm:px-4">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#c8a24a] sm:text-[10px] sm:tracking-[0.22em]">
          {timerLabel}
        </p>
        <p className="mt-0.5 font-mono text-xl font-black leading-none text-[#fff3cf] sm:text-2xl">
          {hasTimer ? formatTimer(timerSeconds) : "Sem timer"}
        </p>
      </div>
      {canSkipPhase ? (
        <button
          className="flex h-11 items-center gap-1.5 rounded-full border border-[#d7b861]/50 bg-[#d7b861] px-3 text-sm font-black text-[#17130d] shadow-2xl shadow-black/35 transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-70 sm:h-12 sm:gap-2 sm:px-4 sm:text-base"
          disabled={hasVotedToSkip}
          onClick={onSkip}
          title="Pular fase"
          type="button"
        >
          <span aria-hidden="true" className="text-lg">
            ⏩
          </span>
          <span>{hasVotedToSkip ? "Aguardando" : "Pular"}</span>
          <span className="rounded-full bg-[#17130d]/15 px-2 py-0.5 text-xs">
            {skipVoteCount}/{activeUserCount}
          </span>
        </button>
      ) : null}
    </div>
  );
}
