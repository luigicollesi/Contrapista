import type { ReactNode } from "react";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";

export function RoomModal({ children }: { children: ReactNode }) {
  return (
    <ResponsiveSheet
      contentClassName="max-w-2xl border border-[#d7b861]/35 bg-[#171b16] p-4 text-stone-50 sm:max-h-[90vh] sm:p-6"
    >
      {children}
    </ResponsiveSheet>
  );
}
