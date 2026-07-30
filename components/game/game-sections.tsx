import {
  getPlayerColorHex,
  getPlayerName,
} from "@/components/game/display-utils";
import type { GameCase, PlayerClue, Room } from "@/components/game/types";

type RoomUser = Room["users"][number];

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
    <section className="mt-8 rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-5 shadow-2xl shadow-black lg:p-6/25">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Preparação da investigação
      </p>
      <h2 className="mt-2 font-serif text-4xl font-bold text-[#fff3cf]">
        Confirme presença para abrir o dossiê
      </h2>
      <p className="mt-3 max-w-2xl text-stone-300">
        A leitura inicial começa somente quando todos estiverem prontos.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => {
          const isReady = readyUserIds.includes(user.id);

          return (
            <article
              className="rounded-lg border bg-[#0f120e] p-4"
              key={user.id}
              style={{ borderColor: `${getPlayerColorHex(user.color)}66` }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-9 w-9 rounded-full border border-white/35"
                  style={{ backgroundColor: getPlayerColorHex(user.color) }}
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-[#fff3cf]">
                    {getPlayerName(user)}
                  </p>
                  <p className="text-sm text-stone-400">
                    {isReady ? "Pronto" : "Aguardando"}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end">
        <button
          className="h-12 rounded-lg bg-[#d7b861] px-6 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={currentUserReady}
          onClick={onReady}
          type="button"
        >
          {currentUserReady ? "Prontidão confirmada" : "Estou pronto"}
        </button>
      </div>
    </section>
  );
}

export function CaseDossier({ gameCase }: { gameCase: GameCase }) {
  return (
    <article className="mt-7 overflow-hidden rounded-lg border border-[#d7b861]/35 bg-[#171b16] shadow-2xl shadow-black/25">
      <div className="border-b border-[#d7b861]/25 bg-[#0f120e] px-6 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">
          Dossiê principal
        </p>
        <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
          {gameCase.title}
        </h2>
      </div>
      <div className="px-6 py-6">
        <div className="max-w-4xl whitespace-pre-line text-lg leading-8 text-stone-300">
          {gameCase.case_text}
        </div>
      </div>
    </article>
  );
}

type PlayerCluesSectionProps = {
  clues: PlayerClue[];
  onSelectClue: (clue: PlayerClue) => void;
  sharedClueIds: string[];
};

export function PlayerCluesSection({
  clues,
  onSelectClue,
  sharedClueIds,
}: PlayerCluesSectionProps) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Fragmentos reservados
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
            Fragmentos sob sua custódia
          </h2>
        </div>
        <p className="text-sm text-stone-400">
          A proporção entre fragmentos corretos e falsos segue a configuração da
          sala.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {clues.map((clue, index) => {
          const wasShared = sharedClueIds.includes(clue.id);

          return (
            <button
              className={`relative min-h-48 rounded border p-5 text-left shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:rotate-0 ${
                wasShared
                  ? "rotate-0 border-[#8b1e1e]/70 bg-[#c8b37d] text-[#4b3724] opacity-75"
                  : "rotate-[-1deg] border-[#d7b861]/35 bg-[#f2dfad] text-[#21170f] hover:border-[#8b1e1e]"
              }`}
              key={clue.id}
              onClick={() => onSelectClue(clue)}
              type="button"
            >
              {wasShared ? (
                <span className="absolute right-3 top-3 rounded-full border border-[#8b1e1e]/40 bg-[#8b1e1e] px-2 py-1 text-xs font-black uppercase tracking-[0.16em] text-white">
                  Compartilhada
                </span>
              ) : null}
              <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-[#8b1e1e]">
                {String(index + 1).padStart(2, "0")}
              </p>
              <p className="mt-5 line-clamp-4 text-lg leading-8">{clue.text}</p>
              <span className="mt-5 inline-flex text-sm font-bold text-[#8b1e1e]">
                {wasShared ? "Reabrir fragmento" : "Abrir fragmento"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function EliminatedCluesArchive({
  groups,
}: {
  groups: EliminatedClueGroup[];
}) {
  return (
    <section className="mt-8 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-5 shadow-2xl shadow-black/20 lg:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Arquivo dos eliminados
      </p>
      <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
        Pistas fora da disputa
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
        Estes fragmentos pertenciam a jogadores eliminados. Eles ficam
        disponíveis para consulta da mesa, mas não podem ser escolhidos nas
        rodadas de compartilhamento.
      </p>
      <div className="mt-5 space-y-5">
        {groups.map(({ player, clues }) => (
          <div
            className="rounded-lg border border-stone-700 bg-[#0f120e] p-4"
            key={player.id}
          >
            <h3 className="font-bold text-[#fff3cf]">
              Fragmentos de {getPlayerName(player)}
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {clues.map((clue) => (
                <article
                  className="min-h-36 rounded border border-stone-700 bg-[#1d201c] p-4 text-stone-300 opacity-90"
                  key={`${player.id}-${clue.id}`}
                >
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-[#d7b861]">
                    Consulta
                  </p>
                  <p className="mt-3 leading-7">{clue.text}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EliminatedPlayerArchive({ gameCase }: { gameCase: GameCase }) {
  return (
    <section className="mt-8 rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-5 shadow-2xl shadow-black lg:p-6/20">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Fora da disputa
      </p>
      <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
        Arquivo completo liberado
      </h2>
      <p className="mt-2 text-stone-400">
        Seu palpite falhou. Você pode consultar todas as pistas e suas
        classificações.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/35 bg-[#0f120e] p-4">
          <h3 className="font-bold text-emerald-300">Pistas verdadeiras</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
            {gameCase.true_clues.map((clue, index) => (
              <li key={`true-${index}`}>{clue}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-red-500/35 bg-[#0f120e] p-4">
          <h3 className="font-bold text-red-300">Pistas falsas</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-300">
            {gameCase.false_clues.map((clue, index) => (
              <li key={`false-${index}`}>{clue}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function FinalSolutionSection({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="mt-8 rounded-lg border border-[#8b1e1e]/50 bg-[#171b16] p-5 shadow-2xl shadow-black lg:p-6/20">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Encerramento
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
            Conclusão final
          </h2>
          <p className="mt-2 text-stone-400">
            Abra somente quando estiver disposto a sustentar uma tese.
          </p>
        </div>
        <button
          className="h-12 rounded-lg bg-[#8b1e1e] px-6 font-bold text-white transition hover:bg-[#a32929]"
          onClick={onOpen}
          type="button"
        >
          Revelar solução
        </button>
      </div>
    </section>
  );
}
