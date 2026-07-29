import { createCaseForRoom, getLastCaseCreationDurationSeconds } from "@/lib/cases";
import { getRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return Response.json({
    estimatedSeconds: getLastCaseCreationDurationSeconds(),
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const room = await getRoom(code);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    if (!room.activecase && !room.allReady) {
      return Response.json(
        { error: "Todos os jogadores precisam estar prontos." },
        { status: 409 },
      );
    }

    const gameCase = await createCaseForRoom(code);

    return Response.json({ case: gameCase });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao criar caso.";

    return Response.json({ error: message }, { status: 500 });
  }
}
