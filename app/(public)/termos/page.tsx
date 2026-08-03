import Link from "next/link";

const sections = [
  {
    title: "1. Uso da plataforma",
    body: "Jogue com respeito. Não atrapalhe partidas nem tente explorar falhas.",
  },
  {
    title: "2. Conta e identidade",
    body: "Cuide da sua conta e escolha um nome público adequado.",
  },
  {
    title: "3. Conteúdo e conduta",
    body: "Não envie conteúdo abusivo, ilegal, sexual explícito ou dados de terceiros.",
  },
  {
    title: "4. Casos e avaliações",
    body: "Casos e avaliações podem variar. Partidas e resultados podem ser registrados.",
  },
  {
    title: "5. Segurança",
    body: "Não use automação abusiva nem tente acessar o que não é seu.",
  },
  {
    title: "6. Privacidade",
    body: "Ao criar conta, você aceita estes termos e a Política de Privacidade.",
  },
  {
    title: "7. Alterações",
    body: "Os termos podem mudar. Mudanças importantes podem pedir novo aceite.",
  },
];

export default function TermsPage() {
  return (
    <main className="sy-theme min-h-screen bg-[#10130f] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
          Contrapista
        </p>
        <h1 className="mt-3 font-serif text-4xl font-bold leading-tight text-[#f2e6c8] sm:text-5xl">
          Termos de Uso
        </h1>
        <p className="mt-4 text-sm font-semibold text-stone-400">
          Versão 2026-08-02
        </p>
        <p className="mt-6 text-base leading-8 text-stone-300">
          Regras básicas para entrar, jogar e manter a mesa justa.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-sm border border-[#d0a85c]/35 px-4 text-sm font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
            href="/privacidade"
          >
            Ver Política de Privacidade
          </Link>
        </div>

        <div className="mt-8 space-y-5">
          {sections.map((section) => (
            <article
              className="rounded-sm border border-[#d0a85c]/25 bg-[#171b16] p-5"
              key={section.title}
            >
              <h2 className="font-serif text-2xl font-bold text-[#f2e6c8]">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-300">
                {section.body}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
