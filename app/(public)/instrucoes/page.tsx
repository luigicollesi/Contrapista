const flow = [
  {
    title: "1. Ante-sala",
    body: "Entre na sala, escolha uma cor e marque pronto quando todo mundo estiver na mesa.",
  },
  {
    title: "2. Criação do caso",
    body: "A sala usa um caso salvo, sorteia um caso compatível ou cria um novo para a partida.",
  },
  {
    title: "3. Leitura inicial",
    body: "Cada jogador lê o caso e suas pistas sem revelar nada ainda.",
  },
  {
    title: "4. Compartilhamento",
    body: "Na sua vez, abra uma pista. A mesa precisa decidir se ela ajuda ou atrapalha.",
  },
  {
    title: "5. Palpite final",
    body: "Qualquer jogador ativo pode tentar resolver. Se errar, sai da disputa e libera suas pistas.",
  },
  {
    title: "6. Encerramento",
    body: "Quando alguém acerta, a partida acaba e a resposta oficial aparece para todos.",
  },
];

const rules = [
  "Jogadores sem nome e cor não podem ficar prontos.",
  "Jogadores inativos por muito tempo saem da participação ativa.",
  "Pistas de eliminados ficam visíveis, mas não podem ser compartilhadas em novas rodadas.",
  "Se a IA não conseguir avaliar um palpite, o autor compara com a resposta oficial.",
];

export default function InstructionsPage() {
  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">
          Manual público
        </p>
        <h1 className="mt-4 max-w-4xl font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Como jogar Contrapista
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-300">
          Cada pessoa recebe uma parte do caso. A mesa conversa, cruza pistas e
          tenta descobrir quais detalhes levam à resposta certa.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flow.map((step) => (
            <article
              className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-5 shadow-2xl shadow-black/20"
              key={step.title}
            >
              <h2 className="font-serif text-2xl font-bold text-[#f2e6c8]">
                {step.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-300">
                {step.body}
              </p>
            </article>
          ))}
        </div>

        <section className="mt-12 rounded-sm border border-[#d0a85c]/30 bg-[#171a1a] p-6 shadow-2xl shadow-black/20">
          <h2 className="font-serif text-3xl font-bold text-[#f2e6c8]">
            Regras rápidas
          </h2>
          <ul className="mt-5 grid gap-3 text-sm leading-7 text-stone-300 md:grid-cols-2">
            {rules.map((rule) => (
              <li className="border-l border-[#d0a85c]/35 pl-3" key={rule}>
                {rule}
              </li>
            ))}
          </ul>
        </section>
      </section>
    </main>
  );
}
