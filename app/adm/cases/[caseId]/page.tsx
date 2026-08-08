import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { getCase } from "@/lib/cases";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const metadata = createNoIndexMetadata("Caso administrativo", "Caso criado no painel administrativo.");

export default async function AdminCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const session = await getAdminSession();

  if (!session?.user?.email) {
    redirect("/auth/entrar?callbackUrl=/adm");
  }

  const { caseId } = await params;
  const gameCase = await getCase(caseId);

  if (!gameCase) notFound();

  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">Caso salvo</p>
        <h1 className="mt-4 font-serif text-4xl font-bold text-[#f2e6c8] sm:text-6xl">{gameCase.title}</h1>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className="rounded-sm bg-[#d0a85c] px-4 py-2 text-sm font-black text-[#171a1a]" href="/adm">
            Criar novo caso
          </Link>
          <Link className="rounded-sm border border-[#d0a85c]/35 px-4 py-2 text-sm font-bold text-[#f2e6c8]" href="/adm">
            Voltar ao painel
          </Link>
        </div>
        <section className="mt-10 whitespace-pre-wrap rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-6 leading-7 text-stone-200">
          {gameCase.case_text}
        </section>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <section className="rounded-sm border border-emerald-400/25 bg-[#171a1a] p-5">
            <h2 className="font-serif text-2xl font-bold text-emerald-200">Pistas verdadeiras</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-stone-200">
              {gameCase.true_clues.map((clue) => <li key={clue}>{clue}</li>)}
            </ol>
          </section>
          <section className="rounded-sm border border-red-400/25 bg-[#171a1a] p-5">
            <h2 className="font-serif text-2xl font-bold text-red-200">Pistas falsas</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-stone-200">
              {gameCase.false_clues.map((clue) => <li key={clue}>{clue}</li>)}
            </ol>
          </section>
        </div>
        <section className="mt-8 whitespace-pre-wrap rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-6 leading-7 text-stone-200">
          <h2 className="font-serif text-2xl font-bold text-[#f2e6c8]">Solução</h2>
          <p className="mt-4">{gameCase.final_answer}</p>
        </section>
      </article>
    </main>
  );
}
