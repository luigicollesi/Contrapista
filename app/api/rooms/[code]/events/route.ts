import { CASE_LOCATIONS } from "@/lib/case-locations";
import { publishRoomEvent } from "@/lib/rooms";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await request.json()) as {
    userId?: string;
    type?: "clue" | "solution" | "solution_correct";
    clueKey?: string;
  };

  if (!body.userId || !body.type) {
    return Response.json({ error: "Evento inválido." }, { status: 400 });
  }

  try {
    if (body.type === "clue") {
      const location = CASE_LOCATIONS.find(
        (candidate) => candidate.key === body.clueKey,
      );

      if (!location) {
        return Response.json({ error: "Dica inválida." }, { status: 400 });
      }

      const event = await publishRoomEvent({
        code,
        userId: body.userId,
        event: {
          type: "clue",
          clueKey: location.key,
          locationName: location.name,
        },
      });

      if (!event) {
        return Response.json({ error: "Sala não encontrada." }, { status: 404 });
      }

      return Response.json({ event });
    }

    const event = await publishRoomEvent({
      code,
      userId: body.userId,
      event: { type: body.type },
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
