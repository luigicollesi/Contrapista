import Link from "next/link";
import { auth } from "@/auth";
import { DeleteAccountPanel } from "@/components/public/delete-account-panel";
import { MatchHistoryPanel } from "@/components/public/match-history-panel";
import { ensureUserAchievements } from "@/lib/auth-users";
import { listUserMatchHistory } from "@/lib/match-history";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  const achievements = session?.user?.id
    ? await ensureUserAchievements(session.user.id)
    : null;
  const matchHistory = session?.user?.id
    ? await listUserMatchHistory(session.user.id)
    : [];

  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-10 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl">
        <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d0a85c]">
          Perfil
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          {session?.user?.name ?? "Seu perfil"}
        </h1>

        {!session ? (
          <div className="mt-10 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-6 text-stone-300">
            Entre pelo cabeçalho para acompanhar suas partidas e resultados.
          </div>
        ) : null}

        {session && achievements ? (
          <>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                ["Partidas jogadas", achievements.total_matches_played],
                ["Ranqueadas jogadas", achievements.ranked_matches_played],
                ["Vitórias", achievements.total_matches_won],
                ["Vitórias ranqueadas", achievements.ranked_matches_won],
                ["Rating", achievements.ranked_rating],
                ["Desafios diários", achievements.daily_problems_solved],
              ].map(([label, value]) => (
                <article
                  className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-5 shadow-2xl shadow-black/20"
                  key={label}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d0a85c]">
                    {label}
                  </p>
                  <p className="mt-3 text-3xl font-black text-[#f2e6c8]">
                    {value}
                  </p>
                </article>
              ))}
            </div>

            <MatchHistoryPanel history={matchHistory} />
            <DeleteAccountPanel />
          </>
        ) : null}

        <Link
          className="mt-8 inline-flex h-11 items-center justify-center rounded-sm bg-[#d0a85c] px-5 text-sm font-black uppercase tracking-[0.18em] text-[#17130d] transition hover:bg-[#f3dfaa]"
          href="/"
        >
          Voltar
        </Link>
      </section>
    </main>
  );
}
