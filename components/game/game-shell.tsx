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
          A sala ou o caso ativo não está mais disponível. Volte ao início para
          criar uma nova sala ou entrar com outro código.
        </p>
        <Link
          className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-[#d7b861] px-6 font-bold text-[#17130d] transition hover:bg-[#f3dfaa]"
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
    <main className="sy-theme relative min-h-screen overflow-hidden bg-[#10130f] px-4 py-6 text-stone-50 sm:px-6 sm:py-8 lg:px-8">
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
    <header className="flex flex-col justify-between gap-5 border-b border-[#d7b861]/25 pb-6 sm:flex-row sm:items-end">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.28em] text-[#c8a24a]">
          Investigação ativa
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold text-[#fff3cf] sm:text-5xl">
          Sala {code}
        </h1>
      </div>
      <LeaveRoomButton isLeaving={isLeaving} onClick={onLeave} />
    </header>
  );
}

export function LoadingDossierMessage() {
  return (
    <p className="mt-8 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-6 text-stone-300 shadow-2xl shadow-black/20">
      Carregando dossiê...
    </p>
  );
}
