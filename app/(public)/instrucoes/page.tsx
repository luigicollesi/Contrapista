import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
  title: "Como jogar",
  description:
    "Aprenda o fluxo do Contrapista: ante-sala, leitura, compartilhamento de pistas, palpites e vitória.",
  path: "/instrucoes",
});

const flow = [
  {
    title: "1. Ante-sala",
    body: "Entre, escolha uma cor e aguarde a mesa.",
  },
  {
    title: "2. Criação do caso",
    body: "Escolha um caso pronto, sorteado ou novo. Em sala personalizada, o líder ajusta pistas por pessoa e proporção de pistas confiáveis.",
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
    body: "Arrisque sua tese. Acertou, vence. Errou, sai.",
  },
  {
    title: "6. Encerramento",
    body: "Quando alguém acerta, a partida acaba e a resposta oficial aparece para todos.",
  },
];

const rules = [
  "Vence quem acertar primeiro.",
  "Salas personalizadas aceitam até 10 participantes.",
  "Nome e cor são obrigatórios.",
  "Inativos saem da disputa.",
  "Pistas de eliminados viram consulta.",
  "Na dúvida, compare com a solução oficial.",
];

export default function InstructionsPage() {
  return (
    <main className="sy-theme public-red-details min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">
          Manual público
        </p>
        <h1 className="mt-4 max-w-4xl font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Como jogar Contrapista
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-stone-300">
          Cada pessoa guarda uma parte do caso. A mesa discute, mas a vitória é
          de quem resolve primeiro.
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
