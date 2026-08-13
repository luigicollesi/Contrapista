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
    <div className="fixed inset-x-3 bottom-[calc(.75rem+env(safe-area-inset-bottom))] z-[90] flex items-center justify-end gap-2 border border-[#d7b861]/35 bg-[#10130f] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,.35)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
      <div className="min-w-20 text-right">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#c8a24a]">
          {timerLabel}
        </p>
        <p className="mt-0.5 font-mono text-xl font-black tabular-nums leading-none text-[#fff3cf]">
          {hasTimer ? formatTimer(timerSeconds) : "Sem timer"}
        </p>
      </div>
      {canSkipPhase ? (
        <button
          className="flex min-h-11 touch-manipulation items-center gap-2 border border-[#d7b861]/55 bg-[#d7b861] px-3 text-sm font-black text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf] focus-visible:ring-offset-2 focus-visible:ring-offset-[#10130f] disabled:cursor-not-allowed disabled:opacity-70"
          disabled={hasVotedToSkip}
          onClick={onSkip}
          type="button"
        >
          <span>{hasVotedToSkip ? "Aguardando" : "Pular"}</span>
          <span className="font-mono text-xs tabular-nums" aria-label={`${skipVoteCount} de ${activeUserCount} votos`}>
            {skipVoteCount}/{activeUserCount}
          </span>
        </button>
      ) : null}
    </div>
  );
}
