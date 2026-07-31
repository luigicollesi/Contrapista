import { auth } from "@/auth";
import { getCase } from "@/lib/cases";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ caseId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login para acessar o caso da partida." },
      { status: 401 },
    );
  }

  const { caseId } = await params;
  const gameCase = await getCase(caseId);

  if (!gameCase) {
    return Response.json({ error: "Caso não encontrado." }, { status: 404 });
  }

  return Response.json({ case: gameCase });
}
