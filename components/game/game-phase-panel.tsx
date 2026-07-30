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
    return "Todos precisam confirmar prontidão para abrir o dossiê.";
  }

  if (phase === "turn") {
    return `Vez de ${currentPlayerName ?? "investigador"}`;
  }

  if (phase === "roulette") {
    return "A ordem da rodada está sendo definida.";
  }

  if (phase === "shared_clue") {
    return "Todos analisam o fragmento aberto.";
  }

  if (phase === "pause") {
    return "Organizem hipóteses antes da próxima rodada.";
  }

  return "Leiam o dossiê e seus fragmentos sem revelar conclusões.";
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
    <section className="sticky top-2 z-20 mt-5 rounded-lg border border-[#d7b861]/35 bg-[#171b16]/95 p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Rodada {round}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-[#fff3cf]">
            {phaseLabel}
          </h2>
          <p className="mt-1 text-sm text-stone-400">
            {phaseDescription(phase, currentPlayerName)}
          </p>
        </div>

        {phase !== "roulette" ? (
          <div className="flex flex-wrap gap-2">
            {players.map((player, index) => {
              const isCurrent = index === currentTurnIndex;

              return (
                <span
                  className={`rounded-full border px-3 py-1 text-sm font-semibold ${
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
