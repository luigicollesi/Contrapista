import { publishRoomEvent } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    userId?: string;
    type?: "solution" | "solution_guess";
    guess?: string;
  };

  if (
    !body.userId ||
    (body.type !== "solution" && body.type !== "solution_guess") ||
    (body.type === "solution_guess" && typeof body.guess !== "string")
  ) {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }

  try {
    const event = await publishRoomEvent({
      code,
      userId: body.userId,
      event:
        body.type === "solution_guess"
          ? { type: body.type, guess: body.guess ?? "" }
          : { type: body.type },
    });

    if (!event) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ event });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao publicar evento.";

    return Response.json({ error: message }, { status: 400 });
  }
}
