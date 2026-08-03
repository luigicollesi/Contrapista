type GamePhase = "ready" | "reading" | "roulette" | "turn" | "shared_clue" | "pause";

type TurnPlayer = {
  id: string;
  name: string;
};

type GamePhasePanelProps = {
  currentTurnIndex: number;
  phase: GamePhase;
  phaseLabel: string;
  players: TurnPlayer[];
  round: number;
};

function phaseDescription(phase: GamePhase, currentPlayerName?: string) {
  if (phase === "ready") {
    return "Confirme presença para abrir o dossiê.";
  }

  if (phase === "turn") {
    return `Vez de ${currentPlayerName ?? "investigador"}`;
  }

  if (phase === "roulette") {
    return "A ordem está sendo definida.";
  }

  if (phase === "shared_clue") {
    return "Todos analisam o fragmento aberto.";
  }

  if (phase === "pause") {
    return "Reorganize a tese.";
  }

  return "Leia sem revelar demais.";
}

export function GamePhasePanel({
  currentTurnIndex,
  phase,
  phaseLabel,
  players,
  round,
}: GamePhasePanelProps) {
  const currentPlayerName = players[currentTurnIndex]?.name;

  return (
    <section className="sticky top-2 z-20 mt-4 rounded-lg border border-[#d7b861]/35 bg-[#171b16]/95 p-3 shadow-2xl shadow-black/20 backdrop-blur sm:mt-5 sm:p-4">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d7b861] sm:text-xs sm:tracking-[0.24em]">
            Rodada {round}
          </p>
          <h2 className="mt-1 truncate text-xl font-bold text-[#fff3cf] sm:text-2xl">
            {phaseLabel}
          </h2>
          <p className="mt-1 text-xs leading-5 text-stone-400 sm:text-sm">
            {phaseDescription(phase, currentPlayerName)}
          </p>
        </div>

        {phase !== "roulette" ? (
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {players.map((player, index) => {
              const isCurrent = index === currentTurnIndex;

              return (
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold sm:text-sm ${
                    isCurrent
                      ? "border-[#d7b861] bg-[#d7b861] text-[#17130d]"
                      : "border-stone-700 bg-[#0f120e] text-stone-300"
                  }`}
                  key={player.id}
                >
                  {player.name}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
