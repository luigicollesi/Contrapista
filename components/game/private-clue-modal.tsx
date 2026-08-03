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
      <div className="flex items-start justify-between gap-4">
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </div>
      <p className="mt-4 whitespace-pre-line text-lg leading-8 text-stone-200 sm:mt-5 sm:text-xl sm:leading-9">
        {clue.text}
      </p>
      <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
        <button
          className="h-12 w-full rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-45 sm:h-11 sm:w-auto"
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
