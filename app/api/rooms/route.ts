import { createRoom } from "@/lib/rooms";

export async function POST() {
  try {
    return Response.json({ room: await createRoom() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao criar sala.";

    return Response.json({ error: message }, { status: 500 });
  }
}
