import Link from "next/link";

const sections = [
  {
    title: "1. Uso da plataforma",
    body: "Contrapista é um jogo de investigação online. Ao usar o site, jogue com respeito, não tente explorar falhas e não atrapalhe a partida de outras pessoas.",
  },
  {
    title: "2. Conta e identidade",
    body: "Você é responsável pelo email, senha, login social e nome público da sua conta. Escolha um nome adequado, sem palavrões, conteúdo sexual, ataques ou tentativa de se passar por outra pessoa, marca ou equipe do Contrapista.",
  },
  {
    title: "3. Conteúdo e conduta",
    body: "Não envie conteúdo ilegal, abusivo, discriminatório, sexual explícito, ameaçador, fraudulento ou com dados pessoais de terceiros. Em caso de abuso, o acesso pode ser limitado ou encerrado.",
  },
  {
    title: "4. Casos, IA e funcionamento",
    body: "Algumas partes do jogo usam IA, então tempo de resposta e qualidade podem variar. Casos, respostas, palpites, salas, ranking e problemas diários podem ser salvos para o jogo funcionar.",
  },
  {
    title: "5. Segurança",
    body: "Não use automação abusiva, não burle proteções, não teste invasões sem autorização e não tente acessar dados que não são da sua conta.",
  },
  {
    title: "6. Privacidade",
    body: "A Política de Privacidade explica quais dados são usados e por quê. Ao criar conta, você aceita estes termos e declara que leu essa política.",
  },
  {
    title: "7. Alterações",
    body: "Estes termos podem mudar quando o jogo, as regras ou as necessidades de segurança mudarem. Mudanças importantes podem pedir novo aceite.",
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
          Estes termos explicam as regras básicas para criar conta e usar o
          Contrapista. A Política de Privacidade complementa este texto e mostra
          quais dados são usados para manter contas, salas e partidas.
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
