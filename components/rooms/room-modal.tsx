import type { ReactNode } from "react";

export function RoomModal({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-5 text-stone-50 shadow-2xl sm:p-6">
        {children}
      </section>
    </div>
  );
}
