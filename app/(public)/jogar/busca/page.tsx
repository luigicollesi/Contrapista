import { MatchmakingSearch } from "@/components/public/matchmaking-search";

type SearchPageProps = {
  searchParams: Promise<{
    mode?: string;
  }>;
};

export default async function MatchmakingPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const mode = params.mode === "ranked" ? "ranked" : "casual";

  return <MatchmakingSearch mode={mode} />;
}
