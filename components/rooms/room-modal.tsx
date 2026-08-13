import type { ReactNode } from "react";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";

export function RoomModal({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "event";
}) {
  return (
    <ResponsiveSheet
      ariaLabel="Janela da investigação"
      className="items-center justify-center px-3 py-4 sm:px-4 sm:py-6"
      contentClassName={`max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-1.5rem),42rem)] border border-[#d7b861]/35 bg-[#171b16] p-4 text-stone-50 sm:max-h-[90vh] sm:p-6 ${variant === "event" ? "max-w-4xl sm:w-[min(56rem,calc(100vw-2rem))]" : "max-w-2xl sm:w-[42rem]"}`}
    >
      {children}
    </ResponsiveSheet>
  );
}
