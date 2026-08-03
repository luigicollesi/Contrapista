import Link from "next/link";

export default function NotFound() {
  return (
    <main className="sy-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-[#10130f] px-6 py-10 text-stone-50">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#8b1e1e]/35 to-transparent" />

      <section className="relative w-full max-w-xl rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-8 text-center shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#d7b861]">
          Arquivo 404
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold text-[#fff3cf]">
          Página não encontrada
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-stone-300">
          Este rastro não consta no arquivo.
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
