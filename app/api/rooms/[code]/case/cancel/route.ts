import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { cancelCustomCaseCreation } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login para cancelar a criação do caso." },
      { status: 401 },
    );
  }

  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  const userId = body.userId?.trim();

  if (!userId) {
    return Response.json({ error: "Usuário não informado." }, { status: 400 });
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "case-cancel",
    code,
    userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const room = await cancelCustomCaseCreation({ code, userId });

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    return errorResponse(error, "Erro ao cancelar criação do caso.");
  }
}
