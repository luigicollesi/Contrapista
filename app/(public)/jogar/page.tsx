import { PlayOptions } from "@/components/public/play-options";

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
          Partidas casuais e rankeadas são pensadas para 4 jogadores, todos
          competindo individualmente. Salas personalizadas seguem o fluxo atual
          por código, enquanto o problema diário prepara uma experiência solo.
        </p>

        <PlayOptions />
      </section>
    </main>
  );
}
