import { PlayOptions } from "@/components/public/play-options";
import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
  title: "Jogar",
  description:
    "Escolha entre partida casual, ranqueada, sala personalizada ou problema diário no Contrapista.",
  path: "/jogar",
});

export default function PlayPage() {
  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">
          Mesa de jogo
        </p>
        <h1 className="mt-4 max-w-4xl font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Escolha como investigar
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-300">
          Jogue com outras pessoas, monte uma sala para o seu grupo ou resolva
          o caso do dia sozinho. Nas partidas em grupo, a disputa é individual:
          vence quem acertar a solução primeiro.
        </p>

        <PlayOptions />
      </section>
    </main>
  );
}
