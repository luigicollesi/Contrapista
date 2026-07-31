import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { listCaseSummaries } from "@/lib/cases";
import { getRoom, selectRoomCase } from "@/lib/rooms";
import { requireAuthorizedRoomUser } from "@/lib/security/route-auth";

function unauthorized() {
  return Response.json(
    { error: "Faça login para escolher um caso." },
    { status: 401 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return unauthorized();
  }

  const { code } = await params;

  try {
    const room = await getRoom(code);

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    if (room.mode !== "custom") {
      return Response.json(
        { error: "A seleção de caso só está disponível em salas personalizadas." },
        { status: 409 },
      );
    }

    return Response.json({
      cases: await listCaseSummaries(100, {
        minTotalClues: room.users.length,
      }),
      room,
    });
  } catch (error) {
    return errorResponse(error, "Erro ao listar casos.");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return unauthorized();
  }

  const { code } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string | null;
    mode?: "generate" | "manual" | "automatic";
    userId?: string;
  };

  if (!body.userId) {
    return Response.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const authorizationFailure = await requireAuthorizedRoomUser({
    action: "case-selection",
    code,
    userId: body.userId,
  });

  if (authorizationFailure) {
    return authorizationFailure;
  }

  try {
    const room = await selectRoomCase({
      caseId: body.caseId?.trim() || null,
      code,
      mode: body.mode,
      userId: body.userId,
    });

    if (!room) {
      return Response.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    return errorResponse(error, "Erro ao escolher caso.");
  }
}
