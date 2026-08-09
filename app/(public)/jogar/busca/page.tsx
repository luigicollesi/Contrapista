import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MatchmakingSearch } from "@/components/public/matchmaking-search";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata(
  "Busca de partida",
  "Fila de pareamento do Contrapista.",
);

type SearchPageProps = {
  searchParams: Promise<{
    mode?: string;
  }>;
};

export default async function MatchmakingPage({ searchParams }: SearchPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/entrar?callbackUrl=/jogar/busca");
  }

  const params = await searchParams;
  const mode = params.mode === "ranked" ? "ranked" : "casual";

  return <MatchmakingSearch mode={mode} />;
}
