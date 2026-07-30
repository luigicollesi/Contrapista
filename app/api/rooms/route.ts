import { errorResponse } from "@/lib/api-response";
import { createRoom } from "@/lib/rooms";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      browserId?: string;
    };

    return Response.json(await createRoom({ browserId: body.browserId }));
  } catch (error) {
    return errorResponse(error, "Erro ao criar sala.", 500);
  }
}
