import { DailyProblem } from "@/components/public/daily-problem";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export const metadata = createNoIndexMetadata(
  "Problema diário",
  "Desafio diário individual do Contrapista.",
);

export default function DailyProblemPage() {
  return <DailyProblem />;
}
