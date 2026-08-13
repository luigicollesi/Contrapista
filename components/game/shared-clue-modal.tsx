import type { GameState } from "@/components/game/types";
import { RoomModal } from "@/components/rooms/room-modal";

type SharedClue = NonNullable<GameState["sharedClue"]>;

type SharedClueModalProps = {
  hasTimer: boolean;
  onClose: () => void;
  sharedClue: SharedClue;
};

export function SharedClueModal({
  hasTimer,
  onClose,
  sharedClue,
}: SharedClueModalProps) {
  return (
    <RoomModal variant="event">
      <div className="flex items-start justify-between gap-4 border-b border-[#d7b861]/25 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Pista aberta
          </p>
          <h2 className="mt-2 text-balance font-serif text-3xl font-bold leading-tight text-[#fff3cf] sm:text-5xl">
            {sharedClue.actorNickname} compartilhou
          </h2>
        </div>
        <button
          aria-label="Fechar fragmento compartilhado"
          className="flex h-10 w-10 touch-manipulation items-center justify-center border border-stone-700 text-xl font-bold text-stone-100 transition-colors duration-150 hover:border-[#d7b861] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b861]"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      {sharedClue.autoShared ? (
        <p
          className={`mt-5 border-l-2 px-4 py-3 text-sm font-bold ${
            sharedClue.autoSharedFalse
              ? "border-red-500 bg-red-950/30 text-red-100"
              : "border-[#d7b861] bg-[#2a2112] text-[#fff3cf]"
          }`}
        >
          {sharedClue.autoSharedFalse
            ? "Tempo esgotado. Uma pista falsa foi aberta."
            : "Tempo esgotado. Uma pista verdadeira foi aberta."}
        </p>
      ) : null}

      <blockquote className="my-7 border-y border-[#d7b861]/20 py-6 text-pretty whitespace-pre-line font-serif text-2xl leading-9 text-stone-100 sm:my-9 sm:py-8 sm:text-3xl sm:leading-[1.5]">
        {sharedClue.clueText}
      </blockquote>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d7b861]">Analisando</p>
        <p className="text-sm font-semibold text-stone-400">
          {hasTimer ? "A fase encerra ao fim do tempo." : "A mesa avança quando todos votarem para pular."}
        </p>
      </div>
    </RoomModal>
  );
}
