import type { GameState } from "@/components/game/types";
import { RoomModal } from "@/components/rooms/room-modal";

type SharedClue = NonNullable<GameState["sharedClue"]>;

type SharedClueModalProps = {
  onClose: () => void;
  sharedClue: SharedClue;
};

export function SharedClueModal({ onClose, sharedClue }: SharedClueModalProps) {
  return (
    <RoomModal>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Pista compartilhada
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
            {sharedClue.actorNickname} abriu um fragmento
          </h2>
        </div>
        <button
          aria-label="Fechar fragmento compartilhado"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </div>

      {sharedClue.autoShared ? (
        <p
          className={`mt-5 rounded-lg border px-4 py-3 text-sm font-bold ${
            sharedClue.autoSharedFalse
              ? "border-red-500/35 bg-red-950/30 text-red-100"
              : "border-[#d7b861]/35 bg-[#2a2112] text-[#fff3cf]"
          }`}
        >
          {sharedClue.autoSharedFalse
            ? "O tempo de escolha foi excedido. Uma pista falsa foi compartilhada automaticamente."
            : "O tempo de escolha foi excedido. Uma pista verdadeira foi compartilhada automaticamente."}
        </p>
      ) : null}

      <p className="mt-5 whitespace-pre-line text-xl leading-9 text-stone-200">
        {sharedClue.clueText}
      </p>
      <p className="mt-5 text-sm font-semibold text-stone-400">
        O fragmento fecha quando o cronômetro chegar a zero.
      </p>
    </RoomModal>
  );
}
