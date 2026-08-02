import type { ReactNode } from "react";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";

export function RoomModal({ children }: { children: ReactNode }) {
  return (
    <ResponsiveSheet
      className="items-center px-3 py-4 sm:px-4 sm:py-6"
      contentClassName="w-[min(calc(100vw-1.5rem),42rem)] max-w-2xl rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-4 text-stone-50 sm:max-h-[90vh] sm:w-[42rem] sm:p-6"
    >
      {children}
    </ResponsiveSheet>
  );
}
