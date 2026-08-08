import { redirect } from "next/navigation";
import { CaseGenerator } from "@/components/admin/case-generator";
import { getAdminDashboard, getAdminSession } from "@/lib/admin";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = createNoIndexMetadata(
  "Administração",
  "Painel administrativo do Contrapista.",
);

function formatDate(value: string | null) {
  if (!value) return "Nunca esteve online";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCredits(value: number | null) {
  return value === null
    ? "Indisponível"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "USD",
      }).format(value);
}

function formatNumber(value: number | null) {
  return value === null ? "Indisponível" : new Intl.NumberFormat("pt-BR").format(value);
}

export default async function AdminPage() {
  const session = await getAdminSession();

  if (!session?.user?.email) {
    redirect("/auth/entrar?callbackUrl=/adm");
  }

  const dashboard = await getAdminDashboard();

  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">
          Administração
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Visão operacional
        </h1>
        <p className="mt-4 max-w-2xl text-stone-300">
          Dados de usuários, presença e consumo da inteligência artificial.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Usuários cadastrados", dashboard.totalUsers],
            ["Online agora", dashboard.onlineUsers],
            ["Créditos usados", formatCredits(dashboard.ai.totalUsage)],
            ["Créditos restantes", formatCredits(dashboard.ai.availableCredits)],
            ["Requests hoje", formatNumber(dashboard.ai.activity.requests)],
            ["Tokens hoje", formatNumber(dashboard.ai.activity.tokens)],
            [
              "Modelos grátis hoje",
              `${dashboard.ai.freeTier.usedToday} / ${dashboard.ai.freeTier.dailyLimit}`,
            ],
            ["Grátis restantes", dashboard.ai.freeTier.remaining],
          ].map(([label, value]) => (
            <article
              className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-5 shadow-2xl shadow-black/20"
              key={label}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d0a85c]">
                {label}
              </p>
              <p className="mt-3 text-3xl font-black text-[#f2e6c8]">{value}</p>
            </article>
          ))}
        </div>

        {dashboard.ai.status === "unavailable" ? (
          <p className="mt-4 text-sm text-amber-200">
            O OpenRouter não disponibilizou créditos para a chave configurada.
          </p>
        ) : null}

        <section className="mt-10 overflow-hidden rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]">
          <div className="border-b border-[#d0a85c]/20 px-5 py-4">
            <h2 className="font-serif text-2xl font-bold text-[#f2e6c8]">
              Modelos gratuitos
            </h2>
            <p className="mt-1 text-sm text-stone-400">
              {dashboard.ai.freeTier.usedToday} usados hoje / {dashboard.ai.freeTier.dailyLimit} por dia / {dashboard.ai.freeTier.remaining} restantes.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#d0a85c]/20 text-xs uppercase tracking-[0.16em] text-[#d0a85c]">
                <tr>
                  <th className="px-5 py-4">Modelo</th>
                  <th className="px-5 py-4">Chamadas hoje</th>
                  <th className="px-5 py-4">Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d0a85c]/10 text-stone-200">
                {dashboard.ai.freeTier.models.length ? (
                  dashboard.ai.freeTier.models.map((model) => (
                    <tr key={model.model}>
                      <td className="px-5 py-4">{model.model}</td>
                      <td className="px-5 py-4">{model.requests}</td>
                      <td className="px-5 py-4">{formatNumber(model.totalTokens)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-4 text-stone-400" colSpan={3}>
                      Nenhuma chamada bem-sucedida para modelo `:free` foi registrada hoje.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <CaseGenerator />

        <section className="mt-10 overflow-hidden rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]">
          <div className="border-b border-[#d0a85c]/20 px-5 py-4">
            <h2 className="font-serif text-2xl font-bold text-[#f2e6c8]">
              Usuários
            </h2>
            <p className="mt-1 text-sm text-stone-400">
              Até 200 usuários, ordenados pela presença mais recente.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[#d0a85c]/20 text-xs uppercase tracking-[0.16em] text-[#d0a85c]">
                <tr>
                  <th className="px-5 py-4">Usuário</th>
                  <th className="px-5 py-4">Email</th>
                  <th className="px-5 py-4">Provider</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Última atividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d0a85c]/10 text-stone-200">
                {dashboard.users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-4">{user.username ?? "Sem username"}</td>
                    <td className="px-5 py-4">{user.email}</td>
                    <td className="px-5 py-4 capitalize">{user.provider}</td>
                    <td className="px-5 py-4">
                      <span className={user.online ? "text-emerald-300" : "text-stone-400"}>
                        {user.online ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-5 py-4">{formatDate(user.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
