"use client";

import { useMemo, useState } from "react";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";
import type { MatchHistoryEntry } from "@/lib/match-history";

type MatchHistoryPanelProps = {
  history: MatchHistoryEntry[];
};

function formatHistoryDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clueLabel(index: number, type: "true" | "false") {
  return `${type === "true" ? "V" : "F"}${index + 1}`;
}

function getHistoryOutcome(item: MatchHistoryEntry) {
  if (!item.finalized_at) {
    return {
      label: "Em andamento",
      summary: "Aguardando fim da partida",
      className: "bg-[#2a2112] text-[#f5e7bd]",
    };
  }

  if (item.user_won) {
    return {
      label: "Vitória",
      summary: `${item.winner_username ?? "Jogador"} venceu`,
      className: "bg-emerald-900/60 text-emerald-100",
    };
  }

  return {
    label: "Derrota",
    summary: item.winner_username
      ? `${item.winner_username} venceu`
      : "Sem vencedor",
    className: "bg-stone-800 text-stone-300",
  };
}

function getWinningGuessText(item: MatchHistoryEntry) {
  if (!item.finalized_at) {
    return "A partida ainda não terminou.";
  }

  return item.winning_final_guess?.trim() || "A partida terminou sem vencedor.";
}

export function MatchHistoryPanel({ history }: MatchHistoryPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => history.find((item) => item.id === selectedId) ?? null,
    [history, selectedId],
  );

  return (
    <section className="mt-10 border-t border-[#d0a85c]/25 pt-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
            Histórico
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]">
            Partidas recentes
          </h2>
        </div>
        <p className="text-sm text-stone-400">
          Abra uma partida para rever o caso, seu palpite e a solução.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="mt-5 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-5 text-sm text-stone-300">
          Suas partidas aparecerão aqui depois do primeiro encerramento.
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]">
          {history.map((item) => {
            const outcome = getHistoryOutcome(item);

            return (
              <button
                className="grid w-full gap-2 border-b border-[#d0a85c]/15 px-4 py-4 text-left transition last:border-b-0 hover:bg-[#d0a85c]/10 sm:grid-cols-[1fr_9rem_8rem] sm:items-center"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <span>
                  <span className="block font-serif text-xl font-bold text-[#f2e6c8]">
                    {item.case_title}
                  </span>
                  <span className="mt-1 block text-sm text-stone-400">
                    {outcome.summary}
                  </span>
                </span>
                <span className="text-sm font-semibold text-stone-300">
                  {formatHistoryDate(item.created_at)}
                </span>
                <span
                  className={`w-fit rounded-sm px-2 py-1 text-xs font-black uppercase tracking-[0.14em] ${outcome.className}`}
                >
                  {outcome.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <ResponsiveSheet
          className="items-center px-3 py-4 sm:px-4 sm:py-6"
          contentClassName="w-[min(calc(100vw-1.5rem),56rem)] rounded-lg border border-[#d0a85c]/30 bg-[#171a1a] p-5 text-stone-100 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
                Revisão da partida
              </p>
              <h3 className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]">
                {selected.case_title}
              </h3>
            </div>
            <button
              aria-label="Fechar histórico"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
              onClick={() => setSelectedId(null)}
              type="button"
            >
              X
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <section className="rounded-sm border border-[#d0a85c]/20 bg-[#0e1111] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d0a85c]">
                Seu palpite
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-300">
                {selected.user_final_guess?.trim() || "Você não enviou palpite nesta partida."}
              </p>
            </section>
            <section className="rounded-sm border border-[#d0a85c]/20 bg-[#0e1111] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d0a85c]">
                Palpite vencedor
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-300">
                {getWinningGuessText(selected)}
              </p>
            </section>
          </div>

          <section className="mt-4 rounded-sm border border-[#d0a85c]/20 bg-[#0e1111] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d0a85c]">
              Caso da partida
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-300">
              {selected.case_text}
            </p>
          </section>

          <section className="mt-4 rounded-sm border border-[#d0a85c]/20 bg-[#0e1111] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d0a85c]">
              Solução oficial
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-300">
              {selected.official_final_answer}
            </p>
          </section>

          <section className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <h4 className="font-serif text-xl font-bold text-[#f2e6c8]">
                Pistas verdadeiras
              </h4>
              <div className="mt-3 grid gap-2">
                {selected.true_clues.map((clue, index) => (
                  <p
                    className="border-l border-emerald-400/50 bg-emerald-950/20 px-3 py-2 text-sm leading-6 text-stone-300"
                    key={`${index}:${clue}`}
                  >
                    <span className="mr-2 font-mono text-xs font-black text-emerald-200">
                      {clueLabel(index, "true")}
                    </span>
                    {clue}
                  </p>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-serif text-xl font-bold text-[#f2e6c8]">
                Pistas falsas
              </h4>
              <div className="mt-3 grid gap-2">
                {selected.false_clues.map((clue, index) => (
                  <p
                    className="border-l border-red-400/50 bg-red-950/20 px-3 py-2 text-sm leading-6 text-stone-300"
                    key={`${index}:${clue}`}
                  >
                    <span className="mr-2 font-mono text-xs font-black text-red-200">
                      {clueLabel(index, "false")}
                    </span>
                    {clue}
                  </p>
                ))}
              </div>
            </div>
          </section>
        </ResponsiveSheet>
      ) : null}
    </section>
  );
}
