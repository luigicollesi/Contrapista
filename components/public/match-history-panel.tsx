"use client";

import Link from "next/link";
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

export function MatchHistoryPanel({ history }: MatchHistoryPanelProps) {
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
          Abra uma revisão completa em tela própria.
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
              <Link
                className="grid w-full gap-2 border-b border-[#d0a85c]/15 px-4 py-4 text-left transition last:border-b-0 hover:bg-[#d0a85c]/10 sm:grid-cols-[1fr_9rem_8rem] sm:items-center"
                href={`/perfil/historico/${item.id}`}
                key={item.id}
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
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
