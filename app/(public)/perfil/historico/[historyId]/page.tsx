import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { MatchHistoryConsole } from "@/components/public/match-history-console";
import { getUserMatchHistoryEntry } from "@/lib/match-history";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export const metadata = createNoIndexMetadata(
  "Histórico da partida",
  "Registro privado de uma partida do Contrapista.",
);

export default async function MatchHistoryDetailPage({
  params,
}: {
  params: Promise<{ historyId: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/entrar");
  }

  const { historyId } = await params;
  const entry = await getUserMatchHistoryEntry({
    historyId,
    userId: session.user.id,
  });

  if (!entry) {
    notFound();
  }

  return <MatchHistoryConsole entry={entry} />;
}
