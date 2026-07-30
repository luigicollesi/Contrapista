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

  return (
    <div className="fixed right-4 top-4 z-[90] flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
      <div className="rounded-full border border-[#d7b861]/45 bg-[#171b16]/95 px-4 py-2 text-right shadow-2xl shadow-black/35 backdrop-blur">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#c8a24a]">
          {timerLabel}
        </p>
        <p className="mt-0.5 font-mono text-2xl font-black leading-none text-[#fff3cf]">
          {formatTimer(timerSeconds)}
        </p>
      </div>
      {canSkipPhase ? (
        <button
          className="flex h-12 items-center gap-2 rounded-full border border-[#d7b861]/50 bg-[#d7b861] px-4 font-black text-[#17130d] shadow-2xl shadow-black/35 transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={hasVotedToSkip}
          onClick={onSkip}
          title="Pular fase por consenso"
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
