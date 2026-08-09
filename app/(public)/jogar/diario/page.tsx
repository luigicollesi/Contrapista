import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DailyProblem } from "@/components/public/daily-problem";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export const metadata = createNoIndexMetadata(
  "Problema diário",
  "Desafio diário individual do Contrapista.",
);

export default async function DailyProblemPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/entrar?callbackUrl=/jogar/diario");
  }

  return <DailyProblem />;
}
