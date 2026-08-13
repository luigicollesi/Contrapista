import type { ReactNode } from "react";
import Link from "next/link";
import { LeaveRoomButton } from "@/components/rooms/leave-room-button";

export function MissingGameScreen({ code }: { code: string }) {
  return (
    <main className="sy-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-[#10130f] px-6 py-10 text-stone-50">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#8b1e1e]/35 to-transparent" />

      <section className="relative w-full max-w-xl rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-8 text-center shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#d7b861]">
          Sala {code}
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold text-[#fff3cf]">
          Dossiê não encontrado
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-stone-300">
          O dossiê saiu da mesa.
        </p>
        <Link
          className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-[#d7b861] px-6 font-bold text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf]"
          href="/"
        >
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}

export function GameShell({ children }: { children: ReactNode }) {
  return (
    <main className="sy-theme relative min-h-screen overflow-x-hidden bg-[#10130f] px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4 text-stone-50 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      {children}
    </main>
  );
}

type GameHeaderProps = {
  code: string;
  isLeaving: boolean;
  onLeave: () => void;
};

export function GameHeader({ code, isLeaving, onLeave }: GameHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-3 border-b border-[#d7b861]/25 pb-4 sm:gap-5">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c8a24a] sm:text-sm sm:tracking-[0.28em]">
          Mesa viva · investigação ativa
        </p>
        <div className="mt-1 flex min-w-0 items-baseline gap-3 sm:mt-2">
          <h1 className="truncate text-balance font-serif text-3xl font-bold text-[#fff3cf] sm:text-4xl">
            Arquivo em curso
          </h1>
          <span className="hidden shrink-0 font-mono text-sm font-bold tracking-[0.18em] text-stone-500 sm:inline" translate="no">
            {code}
          </span>
        </div>
      </div>
      <LeaveRoomButton isLeaving={isLeaving} onClick={onLeave} />
    </header>
  );
}

export function LoadingDossierMessage() {
  return (
    <div className="mx-auto mt-16 max-w-xl border-y border-[#d7b861]/30 py-10 text-center" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">Arquivo da mesa</p>
      <p className="mt-3 font-serif text-2xl text-[#fff3cf]">Abrindo dossiê…</p>
    </div>
  );
}
