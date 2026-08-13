import type { PlayerClue } from "@/components/game/types";
import { RoomModal } from "@/components/rooms/room-modal";

type PrivateClueModalProps = {
  canShare: boolean;
  clue: PlayerClue;
  isAlreadySharedBlocked: boolean;
  onClose: () => void;
  onShare: () => void;
};

export function PrivateClueModal({
  canShare,
  clue,
  isAlreadySharedBlocked,
  onClose,
  onShare,
}: PrivateClueModalProps) {
  return (
    <RoomModal>
      <div className="flex items-start justify-between gap-4 border-b border-[#d7b861]/20 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Fragmento {String(clue.number).padStart(2, "0")}
          </p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
            Fragmento reservado
          </h2>
        </div>
        <button
          aria-label="Fechar"
          className="flex h-10 w-10 touch-manipulation items-center justify-center border border-stone-700 text-xl font-bold text-stone-100 transition-colors duration-150 hover:border-[#d7b861] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b861]"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <p className="mt-6 text-pretty whitespace-pre-line font-serif text-xl leading-9 text-stone-100 sm:text-2xl sm:leading-10">
        {clue.text}
      </p>
      <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
        <button
          className="min-h-12 w-full touch-manipulation bg-[#d7b861] px-5 font-bold text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          disabled={!canShare}
          onClick={onShare}
          type="button"
        >
          {isAlreadySharedBlocked
            ? "Já aberto"
            : "Abrir na rodada"}
        </button>
      </div>
    </RoomModal>
  );
}
