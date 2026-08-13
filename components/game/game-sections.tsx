import type { ReactNode } from "react";
import {
  getPlayerColorHex,
  getPlayerName,
} from "@/components/game/display-utils";
import type { GameCase, PlayerClue, Room } from "@/components/game/types";

type RoomUser = Room["users"][number];

export type GameWorkspaceView = "dossier" | "evidence" | "table";

type EliminatedClueGroup = {
  clues: PlayerClue[];
  player: RoomUser;
};

type ReadyInvestigationSectionProps = {
  currentUserId: string | null;
  onReady: () => void;
  readyUserIds: string[];
  users: RoomUser[];
};

export function ReadyInvestigationSection({
  currentUserId,
  onReady,
  readyUserIds,
  users,
}: ReadyInvestigationSectionProps) {
  const currentUserReady = Boolean(
    currentUserId && readyUserIds.includes(currentUserId),
  );

  return (
    <section className="mx-auto mt-10 w-full max-w-2xl border-y border-[#d7b861]/35 py-8 text-center sm:mt-16 sm:py-12">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-[#d7b861]">
        Dossiê lacrado
      </p>
      <h2 className="mx-auto mt-3 max-w-xl text-balance font-serif text-3xl font-bold leading-tight text-[#fff3cf] sm:text-5xl">
        O caso aguarda a mesa completa
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-stone-400 sm:text-base">
        A leitura começa assim que todos confirmarem presença.
      </p>

      <ol className="mx-auto mt-8 max-w-md divide-y divide-stone-800 border-y border-stone-800 text-left">
        {users.map((user) => {
          const isReady = readyUserIds.includes(user.id);

          return (
            <li className="flex min-w-0 items-center gap-3 py-3" key={user.id}>
              <span
                className={`h-3 w-3 shrink-0 rounded-full border ${isReady ? "border-white/40" : "border-stone-600 bg-transparent"}`}
                style={isReady ? { backgroundColor: getPlayerColorHex(user.color) } : undefined}
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-[#fff3cf]">
                {getPlayerName(user)}
              </span>
              <strong className={`text-[10px] uppercase tracking-[0.14em] ${isReady ? "text-emerald-300" : "text-stone-500"}`}>
                {isReady ? "Confirmado" : "Aguardando"}
              </strong>
            </li>
          );
        })}
      </ol>

      <button
        className="mt-8 min-h-12 w-full touch-manipulation bg-[#d7b861] px-6 font-bold text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf] focus-visible:ring-offset-4 focus-visible:ring-offset-[#10130f] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
        disabled={currentUserReady}
        onClick={onReady}
        type="button"
      >
        {currentUserReady ? "Presença confirmada" : "Estou pronto"}
      </button>
    </section>
  );
}

export function MobileWorkspaceNav({
  activeView,
  evidenceLabel,
  onSelect,
}: {
  activeView: GameWorkspaceView;
  evidenceLabel: string;
  onSelect: (view: GameWorkspaceView) => void;
}) {
  const views = [
    { id: "dossier", label: "Dossiê" },
    { id: "evidence", label: evidenceLabel },
    { id: "table", label: "Mesa" },
  ] satisfies Array<{ id: GameWorkspaceView; label: string }>;

  return (
    <nav className="mt-4 grid grid-cols-3 border-y border-[#d7b861]/25 lg:hidden" aria-label="Áreas da investigação">
      {views.map((view) => {
        const isActive = activeView === view.id;

        return (
          <button
            aria-current={isActive ? "page" : undefined}
            className={`min-h-11 touch-manipulation border-b-2 px-2 text-xs font-black uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d7b861] ${isActive ? "border-[#d7b861] text-[#fff3cf]" : "border-transparent text-stone-500 hover:text-stone-200"}`}
            key={view.id}
            onClick={() => onSelect(view.id)}
            type="button"
          >
            {view.label}
          </button>
        );
      })}
    </nav>
  );
}

export function GameTableRail({
  currentUserId,
  currentTurnUserId,
  eliminatedUserIds,
  order,
  users,
}: {
  currentUserId: string | null;
  currentTurnUserId: string | null;
  eliminatedUserIds: string[];
  order: string[];
  users: RoomUser[];
}) {
  const activeOrder = order
    .map((id) => users.find((user) => user.id === id))
    .filter(
      (user): user is RoomUser =>
        Boolean(user) && !eliminatedUserIds.includes(user?.id ?? ""),
    );
  const orderedIds = new Set(activeOrder.map((user) => user.id));
  const activeWithoutOrder = users.filter(
    (user) => !eliminatedUserIds.includes(user.id) && !orderedIds.has(user.id),
  );
  const activePlayers = [...activeOrder, ...activeWithoutOrder];
  const currentIndex = activePlayers.findIndex((user) => user.id === currentTurnUserId);
  const eliminatedPlayers = users.filter((user) => eliminatedUserIds.includes(user.id));

  return (
    <section aria-labelledby="game-table-heading">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#c8a24a]">Ordem</p>
      <h2 id="game-table-heading" className="mt-1 font-serif text-2xl font-bold text-[#fff3cf]">Mesa</h2>

      <ol className="mt-4 divide-y divide-stone-800 border-y border-stone-800">
        {activePlayers.map((player, index) => {
          const isCurrent = player.id === currentTurnUserId;
          const isNext = currentIndex >= 0 && index === currentIndex + 1;

          return (
            <li className={`flex min-w-0 items-center gap-3 py-3 ${isCurrent ? "bg-[#d7b861]/[0.07]" : ""}`} key={player.id}>
              <span className="h-3 w-3 shrink-0 rounded-full border border-white/30" style={{ backgroundColor: getPlayerColorHex(player.color) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#fff3cf]">{getPlayerName(player)}</p>
                <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em]">
                  {isCurrent ? <span className="text-[#d7b861]">Agora · Compartilhando</span> : null}
                  {isNext ? <span className="text-stone-400">Próximo</span> : null}
                  {!isCurrent && !isNext ? <span className="text-stone-600">Na mesa</span> : null}
                  {player.id === currentUserId ? <span className="text-stone-400"> · Você</span> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {eliminatedPlayers.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-red-300">Fora da disputa</h3>
          <ul className="mt-2 divide-y divide-stone-800">
            {eliminatedPlayers.map((player) => (
              <li className="flex min-w-0 items-center gap-3 py-2.5 text-sm text-stone-500" key={player.id}>
                <span className="h-3 w-3 shrink-0 rounded-full border border-stone-600" />
                <span className="min-w-0 flex-1 truncate line-through">{getPlayerName(player)}</span>
                <strong className="text-[9px] uppercase tracking-[0.1em] text-red-300">Eliminado</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function CaseDossier({ gameCase }: { gameCase: GameCase }) {
  return (
    <article className="h-full bg-[#ded6c1] px-5 py-7 text-[#29251e] sm:px-8 sm:py-9 xl:px-12 xl:py-11" aria-labelledby="case-dossier-heading">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#514b3e]/25 pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#675e4c]">Dossiê principal</p>
            <p className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.14em] text-[#766c58]">Arquivo {gameCase.id.slice(0, 8)}</p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7a2c26]">Em investigação</span>
        </div>
        <h2 id="case-dossier-heading" className="mt-7 text-balance font-serif text-3xl font-bold leading-tight text-[#211e19] sm:text-4xl">
          {gameCase.title}
        </h2>
        <div className="mt-6 whitespace-pre-line text-pretty text-base leading-8 text-[#39342b] sm:text-lg sm:leading-9">
          {gameCase.case_text}
        </div>
      </div>
    </article>
  );
}

export function EvidenceLedger({
  children,
  isMyTurn,
}: {
  children: ReactNode;
  isMyTurn: boolean;
}) {
  return (
    <section className={`h-full ${isMyTurn ? "bg-[#1a1c16]" : "bg-[#141712]"}`} aria-labelledby="evidence-ledger-heading">
      <div className="border-b border-[#d7b861]/20 px-4 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#c8a24a]">Arquivo pessoal</p>
        <h2 id="evidence-ledger-heading" className="mt-1 font-serif text-2xl font-bold text-[#fff3cf]">Evidências</h2>
        {isMyTurn ? <p className="mt-2 text-xs font-black uppercase tracking-[0.13em] text-emerald-300">Sua vez de compartilhar</p> : null}
      </div>
      <div className="divide-y divide-[#d7b861]/15 px-4">{children}</div>
    </section>
  );
}

type PlayerCluesSectionProps = {
  clues: PlayerClue[];
  isMyTurn: boolean;
  onSelectClue: (clue: PlayerClue) => void;
  sharedClueIds: string[];
};

export function PlayerCluesSection({
  clues,
  isMyTurn,
  onSelectClue,
  sharedClueIds,
}: PlayerCluesSectionProps) {
  return (
    <section className="py-5" aria-labelledby="private-clues-heading">
      <h3 id="private-clues-heading" className="text-xs font-black uppercase tracking-[0.18em] text-[#d7b861]">Fragmentos reservados</h3>
      <p className="mt-1 text-xs leading-5 text-stone-500">Abra para consultar. Compartilhe apenas quando chegar sua vez.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {clues.map((clue) => {
          const wasShared = sharedClueIds.includes(clue.id);

          return (
            <button
              className={`group relative mb-2 flex min-h-44 flex-col touch-manipulation border p-4 text-left text-[#241b12] shadow-[0_2px_8px_rgba(0,0,0,.16)] transition-[border-color,transform,opacity] duration-150 motion-reduce:transition-none motion-reduce:hover:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b861] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141712] ${wasShared ? "border-[#8b1e1e]/45 bg-[#c9bb95] opacity-65" : isMyTurn ? "border-[#d7b861] bg-[#ead9ac] hover:-translate-y-0.5" : "border-[#d7b861]/35 bg-[#dfd0a7] hover:border-[#d7b861]"}`}
              key={clue.id}
              onClick={() => onSelectClue(clue)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-black tabular-nums text-[#7b2521]">{String(clue.number).padStart(2, "0")}</span>
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[#7b2521]">{wasShared ? "Compartilhado" : isMyTurn ? "Selecionar" : "Consultar"}</span>
              </div>
              <p className="mt-3 line-clamp-5 text-[15px] leading-6">{clue.text}</p>
              <span className="mt-auto block border-t border-[#7b2521]/20 pt-3 text-xs font-black uppercase tracking-[0.1em] text-[#7b2521]">
                {wasShared
                  ? "Consultar novamente"
                  : isMyTurn
                    ? "Abrir para compartilhar"
                    : "Abrir fragmento"}
                <span aria-hidden="true"> →</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function EliminatedCluesArchive({ groups }: { groups: EliminatedClueGroup[] }) {
  return (
    <section className="py-5" aria-labelledby="eliminated-archive-heading">
      <h3 id="eliminated-archive-heading" className="text-xs font-black uppercase tracking-[0.18em] text-[#d7b861]">Arquivo dos eliminados</h3>
      <div className="mt-3 divide-y divide-stone-800 border-y border-stone-800">
        {groups.map(({ player, clues }) => (
          <details className="group py-3" key={player.id}>
            <summary className="flex min-h-11 cursor-pointer touch-manipulation list-none items-center justify-between gap-3 text-sm font-bold text-[#fff3cf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b861]">
              <span className="truncate">{getPlayerName(player)} · {clues.length} fragmentos</span>
              <span aria-hidden="true" className="transition-transform duration-150 group-open:rotate-90">›</span>
            </summary>
            <ol className="mt-3 space-y-3 border-l border-stone-700 pl-3">
              {clues.map((clue) => (
                <li className="text-sm leading-6 text-stone-400" key={`${player.id}-${clue.id}`}>{clue.text}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}

export function EliminatedPlayerArchive({ gameCase }: { gameCase: GameCase }) {
  return (
    <section className="py-5" aria-labelledby="observer-archive-heading">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">Fora da disputa</p>
      <h3 id="observer-archive-heading" className="mt-1 font-serif text-2xl font-bold text-[#fff3cf]">Acompanhando a investigação</h3>
      <p className="mt-2 text-sm leading-6 text-stone-400">O arquivo completo foi liberado em modo observador.</p>
      <div className="mt-5 border-t border-emerald-500/25 pt-4">
        <h4 className="text-xs font-black uppercase tracking-[0.14em] text-emerald-300">Pistas verdadeiras</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
          {gameCase.true_clues.map((clue, index) => <li key={`true-${index}`}>{clue}</li>)}
        </ul>
      </div>
      <div className="mt-5 border-t border-red-500/25 pt-4">
        <h4 className="text-xs font-black uppercase tracking-[0.14em] text-red-300">Pistas falsas</h4>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
          {gameCase.false_clues.map((clue, index) => <li key={`false-${index}`}>{clue}</li>)}
        </ul>
      </div>
    </section>
  );
}

export function FinalSolutionSection({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="py-5" aria-labelledby="final-thesis-heading">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#c8a24a]">Conclusão</p>
      <h3 id="final-thesis-heading" className="mt-1 font-serif text-2xl font-bold text-[#fff3cf]">Apresentar tese</h3>
      <p className="mt-2 text-sm leading-6 text-stone-400">Um veredito incorreto elimina você da disputa.</p>
      <button
        className="mt-4 min-h-11 w-full touch-manipulation border border-[#8b1e1e]/70 px-4 text-sm font-bold text-red-100 transition-colors duration-150 hover:border-red-300 hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        onClick={onOpen}
        type="button"
      >
        Apresentar tese →
      </button>
    </section>
  );
}
