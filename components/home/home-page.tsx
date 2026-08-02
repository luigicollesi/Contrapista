import Link from "next/link";

const manualHighlights = [
  {
    title: "Mesa de investigação",
    items: [
      "O caso começa incompleto, com detalhes que parecem não combinar.",
      "A mesa discute versões, cruza pistas e corta distrações em uma disputa direta.",
      "Ganha quem acertar a solução do caso primeiro.",
    ],
  },
  {
    title: "Pistas em disputa",
    items: [
      "Cada jogador recebe pistas que podem ajudar ou confundir.",
      "Nada vem marcado como certo. A mesa decide no debate.",
      "Quem erra sai da disputa, mas passa a enxergar mais do arquivo.",
    ],
  },
  {
    title: "Pressão de rodada",
    items: [
      "A partida alterna leitura, revelação e tempo para pensar.",
      "A sala escolhe se quer um ritmo calmo ou mais apertado.",
      "Quando o relógio aperta, palpite e dedução se misturam.",
    ],
  },
];

const manualFlow = [
  {
    step: "01",
    title: "Reúna a mesa",
    body: "Entre na sala, escolha uma cor e espere todo mundo ficar pronto.",
  },
  {
    step: "02",
    title: "Defina o tom da investigação",
    body: "Antes de começar, a sala ajusta os tempos e escolhe como o caso será usado.",
  },
  {
    step: "03",
    title: "Leia sem revelar demais",
    body: "Leia o caso e suas pistas em silêncio. Nem tudo precisa ir para a mesa logo de cara.",
  },
  {
    step: "04",
    title: "Deixe a ordem decidir",
    body: "A roleta define a ordem. Cada jogador tem seu momento de abrir uma pista.",
  },
  {
    step: "05",
    title: "Abra um fragmento",
    body: "Na sua vez, revele uma pista. Ela pode resolver uma dúvida ou criar outra.",
  },
  {
    step: "06",
    title: "Sustente uma tese",
    body: "Quando achar que entendeu, tente responder. Acertou, acaba. Errou, continua sem você na disputa.",
  },
];

const manualDetails = [
  "A mesa pode pular uma fase quando todos já leram o suficiente.",
  "Quem erra a solução sai da disputa e libera suas pistas para consulta.",
  "Durante um palpite final, a partida pausa até a resposta ser enviada.",
  "Depois do fim, cada jogador vê a solução antes de voltar para a ante-sala.",
  "A conta guarda perfil e modos públicos; a sala usa o navegador para reconhecer você.",
];

const heroStats = [
  { label: "Modos preparados", value: "4" },
  { label: "Competição padrão", value: "4P" },
  { label: "Pistas em disputa", value: "V/F" },
];

const valueProps = [
  "Casos com pistas úteis e pistas que desviam.",
  "Discussão de mesa competitiva, com risco real ao responder.",
  "Salas privadas, modos públicos e perfil salvo.",
];

function EvidencePreview() {
  return (
    <div className="relative hidden min-h-[520px] lg:block">
      <div className="absolute left-10 top-4 h-72 w-56 rotate-[-8deg] rounded-sm border border-[#d0a85c]/40 bg-[#e9d3a0] p-5 text-[#21170f] shadow-2xl">
        <p className="border-b border-[#6f5533]/30 pb-3 font-serif text-2xl font-bold">
          Dossiê
        </p>
        <div className="mt-5 space-y-3">
          <span className="block h-3 w-36 rounded-full bg-[#6f5533]/50" />
          <span className="block h-3 w-44 rounded-full bg-[#6f5533]/35" />
          <span className="block h-3 w-28 rounded-full bg-[#6f5533]/35" />
        </div>
        <div className="mt-8 rounded border border-[#8b1e1e]/30 px-3 py-2 text-center font-mono text-xl font-bold tracking-[0.28em] text-[#7c1f2a]">
          ARQUIVO
        </div>
      </div>
      <div className="absolute right-2 top-24 h-80 w-72 rotate-6 rounded-sm border border-stone-600 bg-[#202323] p-5 shadow-2xl">
        <div className="grid h-full grid-cols-3 grid-rows-4 gap-3">
          {Array.from({ length: 12 }).map((_, index) => (
            <span
              className="rounded border border-[#d0a85c]/20 bg-[#0e1111]"
              key={index}
            />
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-24 h-52 w-80 rotate-[-2deg] rounded-sm border border-[#b98d47]/40 bg-[#151818] p-6 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#b98d47]">
          Quadro de evidências
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="h-20 rounded border border-stone-600 bg-stone-900" />
          <div className="h-20 rounded border border-stone-600 bg-stone-900" />
        </div>
      </div>
    </div>
  );
}

function HomeHero() {
  return (
    <section className="home-hero grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.95fr)] lg:gap-14">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#d0a85c]">
          Jogo online de investigação
        </p>
        <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-[0.98] text-[#f2e6c8] sm:text-7xl lg:text-8xl">
          Contrapista
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-200 sm:text-xl">
          Entre em uma sala, leia o caso e dispute para ser a primeira pessoa a
          acertar a solução. A resposta certa quase sempre nasce da conversa,
          mas só um jogador vence.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-sm bg-[#d0a85c] px-6 text-sm font-black uppercase tracking-[0.18em] text-[#17130d] transition hover:bg-[#f3dfaa]"
            href="/jogar"
          >
            Ver modos de jogo
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-sm border border-[#d0a85c]/45 px-6 text-sm font-bold uppercase tracking-[0.18em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
            href="/instrucoes"
          >
            Como funciona
          </Link>
        </div>
        <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
          {heroStats.map((stat) => (
            <div className="border-l border-[#d0a85c]/35 pl-3" key={stat.label}>
              <p className="font-serif text-3xl font-bold text-[#f2e6c8]">
                {stat.value}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-stone-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <EvidencePreview />
    </section>
  );
}

function ValueProposition() {
  return (
    <section className="mt-14 border-y border-[#d0a85c]/20 py-8 sm:mt-16">
      <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#d0a85c]">
            Por que jogar
          </p>
          <h2 className="mt-4 font-serif text-4xl font-bold text-[#f2e6c8] sm:text-5xl">
            Um jogo de dedução para discutir versões
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {valueProps.map((item, index) => (
            <article className="border-l border-[#d0a85c]/30 pl-4" key={item}>
              <span className="font-mono text-sm font-black text-[#d0a85c]">
                0{index + 1}
              </span>
              <p className="mt-3 text-base leading-7 text-stone-300">{item}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ManualHighlights() {
  return (
    <div>
      <div className="flex items-end justify-between gap-4 border-b border-[#d0a85c]/20 pb-3">
        <h3 className="font-serif text-3xl font-bold text-[#f2e6c8]">
          Características principais
        </h3>
        <span className="font-mono text-sm font-bold text-[#b98d47]">
          Visão geral
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {manualHighlights.map((section) => (
          <article
            className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-5 shadow-xl shadow-black/20"
            key={section.title}
          >
            <h4 className="font-serif text-xl font-bold leading-tight text-[#f2e6c8]">
              {section.title}
            </h4>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
              {section.items.map((item) => (
                <li className="border-l border-[#d0a85c]/35 pl-3" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function ManualFlow() {
  return (
    <div>
      <div className="flex items-end justify-between gap-4 border-b border-[#d0a85c]/20 pb-3">
        <h3 className="font-serif text-3xl font-bold text-[#f2e6c8]">
          Fluxo de partida
        </h3>
        <span className="font-mono text-sm font-bold text-[#b98d47]">
          Passo a passo
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {manualFlow.map((step) => (
          <article
            className="grid gap-4 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-4 shadow-xl shadow-black/20 sm:grid-cols-[4rem_1fr]"
            key={step.step}
          >
            <span className="font-mono text-2xl font-black text-[#d0a85c]">
              {step.step}
            </span>
            <div>
              <h4 className="font-serif text-xl font-bold text-[#f2e6c8]">
                {step.title}
              </h4>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                {step.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ManualDetails() {
  return (
    <div className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-5 shadow-xl shadow-black/20">
      <h3 className="font-serif text-3xl font-bold text-[#f2e6c8]">
        Detalhes importantes
      </h3>
      <ul className="mt-4 grid gap-3 text-sm leading-6 text-stone-300 md:grid-cols-2">
        {manualDetails.map((detail) => (
          <li className="border-l border-[#d0a85c]/35 pl-3" key={detail}>
            {detail}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldManual() {
  return (
    <section className="mt-14 border-t border-[#d0a85c]/25 pt-8 sm:mt-16 sm:pt-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(280px,.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-12">
        <div className="lg:sticky lg:top-8">
          <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#d0a85c]">
            Manual de campo
          </p>
          <h2 className="mt-4 font-serif text-4xl font-bold text-[#f2e6c8] sm:text-5xl">
            Como conduzir uma sessão
          </h2>
          <p className="mt-4 text-lg leading-8 text-stone-300">
            Contrapista coloca a mesa diante de um caso incompleto. Cada pessoa
            tem uma parte do arquivo, mas ninguém sabe de início o que é pista
            boa e o que é desvio.
          </p>
          <div className="mt-6 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-5 shadow-xl shadow-black/20">
            <h3 className="font-serif text-2xl font-bold text-[#f2e6c8]">
              Objetivo
            </h3>
            <p className="mt-3 text-sm leading-7 text-stone-300">
              Monte uma resposta antes dos outros jogadores. Quem acertar a
              solução primeiro vence; quem errar sai da disputa.
            </p>
          </div>
        </div>

        <div className="space-y-8">
          <ManualHighlights />
          <ManualFlow />
          <ManualDetails />
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <main className="sy-theme home-page min-h-screen overflow-hidden bg-[#0e1111] text-stone-50">
      <div className="absolute inset-0 opacity-[0.18]">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-[#7c1f2a]/30 via-[#1e2626]/20 to-transparent" />
      <div className="home-shell relative mx-auto flex w-full max-w-7xl flex-col px-4 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10 lg:px-8 lg:pb-14">
        <HomeHero />
        <ValueProposition />
        <FieldManual />
      </div>
    </main>
  );
}
