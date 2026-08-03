import { createPublicMetadata } from "@/lib/site-metadata";
import { listCaseSummaries, type CaseSummary } from "@/lib/cases";

export const dynamic = "force-dynamic";

export const metadata = createPublicMetadata({
  title: "Casos disponíveis",
  description:
    "Consulte o arquivo público de casos do Contrapista com título, quantidade de pistas e proporção de pistas falsas.",
  path: "/casos",
});

function CaseCard({ item }: { item: CaseSummary }) {
  return (
    <article className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-5 shadow-2xl shadow-black/20">
      <h2 className="font-serif text-2xl font-bold text-[#f2e6c8]">
        {item.title}
      </h2>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="border-l border-[#d0a85c]/35 pl-3">
          <dt className="font-bold uppercase tracking-[0.18em] text-[#d0a85c]">
            Pistas
          </dt>
          <dd className="mt-1 text-2xl font-black text-stone-50">
            {item.totalClues}
          </dd>
        </div>
        <div className="border-l border-[#d0a85c]/35 pl-3">
          <dt className="font-bold uppercase tracking-[0.18em] text-[#d0a85c]">
            Falsas
          </dt>
          <dd className="mt-1 text-2xl font-black text-stone-50">
            {item.falseCluePercentage}%
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default async function CasesPage() {
  let cases: CaseSummary[] = [];
  let loadError = "";

  try {
    cases = await listCaseSummaries();
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "Não deu para carregar os casos.";
  }

  return (
    <main className="sy-theme public-red-details min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">
          Arquivo público
        </p>
        <h1 className="mt-4 max-w-4xl font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Casos disponíveis
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-300">
          Consulte o arquivo sem abrir pistas, narrativa ou solução.
        </p>

        {loadError ? (
          <section className="mt-10 rounded-sm border border-red-400/40 bg-red-950/25 p-5 text-sm leading-7 text-red-100">
            Não deu para carregar a lista de casos agora.
          </section>
        ) : null}

        {!loadError && cases.length === 0 ? (
          <section className="mt-10 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-6 text-stone-300 shadow-2xl shadow-black/20">
            Ainda não há casos salvos.
          </section>
        ) : null}

        {cases.length > 0 ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cases.map((item) => (
              <CaseCard item={item} key={item.id} />
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
