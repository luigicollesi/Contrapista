import { createCaseForRoom, getLastCaseCreationDurationSeconds } from "@/lib/cases";
import { finishRoomCase, getRoom } from "@/lib/rooms";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    console.error("[case-generation:error]", error);
    await finishRoomCase({ code }).catch(() => null);
    const message = error instanceof Error ? error.message : "";
    const isRateLimit =
      message.includes("free-models-per-day") ||
      message.toLowerCase().includes("rate limit");

    return Response.json(
      {
        error: isRateLimit
          ? "O limite diário dos modelos gratuitos do OpenRouter foi atingido. Voltem para a ante-sala e tentem novamente após o reset diário ou usem uma chave com créditos."
          : "Os modelos de IA estão indisponíveis no momento. Voltem para a ante-sala e tentem novamente mais tarde.",
      },
      { status: isRateLimit ? 429 : 503 },
    );
  }
}
