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
      className="inline-flex h-10 shrink-0 items-center justify-center border border-[#8b1e1e]/70 px-3 text-[11px] font-black uppercase tracking-[0.12em] text-red-100 transition-colors hover:border-red-300 hover:bg-[#2a1513] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10130f] disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:text-xs sm:tracking-[0.18em]"
      disabled={disabled || isLeaving}
      onClick={onClick}
      type="button"
    >
      {isLeaving ? "Saindo…" : "Sair da mesa"}
    </button>
  );
}
