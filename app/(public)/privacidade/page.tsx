import Link from "next/link";

const sections = [
  {
    title: "1. Dados de conta",
    body: "Ao criar conta, podemos guardar email, nome de usuário, tipo de login, hash da senha quando houver senha, datas da conta e registros de aceite dos termos.",
  },
  {
    title: "2. Login social",
    body: "Ao entrar com Google ou GitHub, usamos os dados necessários para reconhecer sua conta, como email e identificador do provedor. O nome desses serviços não vira seu nome público automaticamente.",
  },
  {
    title: "3. Dados de jogo",
    body: "Para manter partidas funcionando, podemos guardar código de sala, participantes, cor escolhida, estado do jogo, pistas, palpites, respostas, eventos, problemas diários, perfil e ranking.",
  },
  {
    title: "4. Uso de IA",
    body: "Algumas ações usam provedores de IA para criar casos ou avaliar respostas. O envio pode incluir prompt, resposta oficial, palpite do jogador e o contexto necessário para a tarefa. Chaves de API não são expostas.",
  },
  {
    title: "5. Segurança e prevenção de abuso",
    body: "Usamos registros técnicos, limites de requisição, validação de sessão, proteção CSRF, verificação de origem e outros controles para reduzir abuso e acesso indevido.",
  },
  {
    title: "6. Compartilhamento",
    body: "Os dados não são vendidos. Eles podem passar por serviços necessários para login, banco de dados, hospedagem, OAuth, IA e ferramentas técnicas do Contrapista.",
  },
  {
    title: "7. Retenção e remoção",
    body: "Dados de conta, partidas, ranking e problemas diários podem ser mantidos enquanto forem úteis para o serviço. Quando possível, contas e registros podem ser removidos ao deixarem de ser necessários ou em caso de abuso.",
  },
  {
    title: "8. Atualizações",
    body: "Esta política pode mudar junto com o jogo. Mudanças importantes podem aparecer no site ou pedir novo aceite.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="sy-theme min-h-screen bg-[#10130f] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
          Contrapista
        </p>
        <h1 className="mt-3 font-serif text-4xl font-bold leading-tight text-[#f2e6c8] sm:text-5xl">
          Política de Privacidade
        </h1>
        <p className="mt-4 text-sm font-semibold text-stone-400">
          Versão 2026-08-02
        </p>
        <p className="mt-6 text-base leading-8 text-stone-300">
          Esta política explica quais dados o Contrapista usa para manter
          cadastro, login, salas, partidas, problema diário, ranking e IA.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-sm border border-[#d0a85c]/35 px-4 text-sm font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
            href="/termos"
          >
            Ver Termos de Uso
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
