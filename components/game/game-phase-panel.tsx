import type { ReactNode } from "react";

type GamePhase = "ready" | "reading" | "roulette" | "turn" | "shared_clue" | "pause";

type TurnPlayer = {
  id: string;
  name: string;
};

type GamePhasePanelProps = {
  actions: ReactNode;
  currentTurnIndex: number;
  phase: GamePhase;
  phaseLabel: string;
  players: TurnPlayer[];
  round: number;
};

const phaseSteps = [
  { id: "reading", label: "Leitura" },
  { id: "roulette", label: "Sorteio" },
  { id: "turn", label: "Compartilhar" },
  { id: "shared_clue", label: "Analisar" },
  { id: "pause", label: "Relacionar" },
] as const;

function phaseDescription(phase: GamePhase, currentPlayerName?: string) {
  if (phase === "turn") {
    return `Vez de ${currentPlayerName ?? "investigador"}`;
  }

  if (phase === "roulette") {
    return "A ordem está sendo definida";
  }

  if (phase === "shared_clue") {
    return "A mesa analisa o fragmento aberto";
  }

  if (phase === "pause") {
    return "Relacione as evidências e reorganize a tese";
  }

  return "Leia o arquivo e seus fragmentos reservados";
}

export function GamePhasePanel({
  actions,
  currentTurnIndex,
  phase,
  phaseLabel,
  players,
  round,
}: GamePhasePanelProps) {
  const currentPlayerName = players[currentTurnIndex]?.name;

  return (
    <section
      className="sticky top-0 z-40 -mx-3 mt-3 border-y border-[#d7b861]/30 bg-[#10130f]/[0.98] px-3 py-3 shadow-[0_10px_24px_rgba(0,0,0,.2)] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      aria-label="Estado atual da investigação"
    >
      <div className="mx-auto max-w-[1480px]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c8a24a] sm:text-xs">
                Rodada {round}
              </p>
              <span aria-hidden="true" className="text-stone-700">/</span>
              <h2 className="truncate text-sm font-black uppercase tracking-[0.12em] text-[#fff3cf] sm:text-base">
                {phaseLabel}
              </h2>
            </div>
            <p className="mt-1 truncate text-xs text-stone-400 sm:text-sm">
              {phaseDescription(phase, currentPlayerName)}
            </p>
          </div>
          <div>{actions}</div>
        </div>

        <div className="mt-3 hidden items-center gap-2 lg:flex" aria-label="Fluxo da rodada">
          {phaseSteps.map((step, index) => {
            const isCurrent = step.id === phase;

            return (
              <div className="flex min-w-0 flex-1 items-center gap-2" key={step.id}>
                <div className={`min-w-0 border-t-2 pt-1.5 ${isCurrent ? "border-[#d7b861]" : "border-stone-800"}`}>
                  <span className={`block truncate text-[10px] font-black uppercase tracking-[0.12em] ${isCurrent ? "text-[#fff3cf]" : "text-stone-600"}`}>
                    {step.label}
                  </span>
                  {isCurrent ? <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.14em] text-[#d7b861]">Agora</span> : null}
                </div>
                {index < phaseSteps.length - 1 ? <span aria-hidden="true" className="text-stone-700">›</span> : null}
              </div>
            );
          })}
        </div>

        {phase !== "roulette" && players.length > 0 ? (
          <ol className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-0.5 text-xs" aria-label="Ordem da mesa">
            {players.map((player, index) => {
              const isCurrent = index === currentTurnIndex;
              const isNext = index === currentTurnIndex + 1;

              return (
                <li className="flex shrink-0 items-center gap-2" key={player.id}>
                  {index > 0 ? <span aria-hidden="true" className="text-stone-700">→</span> : null}
                  <span className={isCurrent ? "font-bold text-[#fff3cf]" : "text-stone-500"}>
                    {player.name}
                    {isCurrent ? <strong className="ml-1.5 text-[9px] uppercase tracking-[0.1em] text-[#d7b861]">Agora</strong> : null}
                    {isNext ? <strong className="ml-1.5 text-[9px] uppercase tracking-[0.1em] text-stone-400">Próximo</strong> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
