import { createRoom } from "@/lib/rooms";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      browserId?: string;
    };

    return Response.json(await createRoom({ browserId: body.browserId }));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao criar sala.";

    return Response.json({ error: message }, { status: 500 });
  }
}
