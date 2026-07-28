import { getCase } from "@/lib/cases";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const { caseId } = await params;
  const gameCase = await getCase(caseId);

  if (!gameCase) {
    return Response.json({ error: "Caso nao encontrado." }, { status: 404 });
  }

  return Response.json({ case: gameCase });
}
