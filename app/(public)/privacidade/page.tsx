import Link from "next/link";
import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
  title: "Política de Privacidade",
  description:
    "Veja como o Contrapista trata dados de conta, partidas, histórico, login social e segurança.",
  path: "/privacidade",
});

const sections = [
  {
    title: "1. Dados de conta",
    body: "Guardamos o necessário para sua conta, nome público e aceite dos termos.",
  },
  {
    title: "2. Login social",
    body: "Google e GitHub servem para entrada. Seu nome público continua sendo escolhido por você.",
  },
  {
    title: "3. Dados de jogo",
    body: "Partidas, pistas, palpites, desafios e ranking podem ser mantidos no seu histórico.",
  },
  {
    title: "4. Avaliações automáticas",
    body: "Algumas criações e avaliações usam IA. Enviamos apenas o necessário para a jogada.",
  },
  {
    title: "5. Segurança e prevenção de abuso",
    body: "Usamos controles de segurança para proteger contas e mesas.",
  },
  {
    title: "6. Compartilhamento",
    body: "Seus dados não são vendidos. Serviços parceiros ajudam o jogo a funcionar.",
  },
  {
    title: "7. Retenção e remoção",
    body: "Mantemos registros enquanto forem úteis para conta, partidas e segurança.",
  },
  {
    title: "8. Atualizações",
    body: "Esta política pode mudar junto com o jogo. Mudanças importantes podem aparecer no site ou pedir novo aceite.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="sy-theme public-red-details min-h-screen bg-[#10130f] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
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
          Como o Contrapista cuida da sua conta, partidas e histórico.
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
