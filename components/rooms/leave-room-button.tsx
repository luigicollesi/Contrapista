type LeaveRoomButtonProps = {
  disabled?: boolean;
  isLeaving?: boolean;
  onClick: () => void;
};

export function LeaveRoomButton({
  disabled = false,
  isLeaving = false,
  onClick,
}: LeaveRoomButtonProps) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-lg border border-[#8b1e1e]/70 bg-[#171b16] px-4 text-xs font-black uppercase tracking-[0.18em] text-red-100 shadow-lg shadow-black/20 transition hover:border-[#d7b861]/55 hover:bg-[#2a1513] disabled:cursor-not-allowed disabled:opacity-70"
      disabled={disabled || isLeaving}
      onClick={onClick}
      type="button"
    >
      {isLeaving ? "Saindo..." : "Sair da sala"}
    </button>
  );
}
