import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { auth } from "@/auth";
import { deleteUserAccount } from "@/lib/auth-users";
import { leaveRoomsByAccountUserId } from "@/lib/rooms";
import { rateLimitResponse } from "@/lib/security/rate-limit";

const DELETE_CONFIRMATION_CLIENT_TTL_MS = 30_000;
const DELETE_CONFIRMATION_SERVER_TTL_MS = 40_000;

type DeleteChallenge = {
  code: string;
  expiresAt: number;
  serverExpiresAt: number;
  userId: string;
};

const deleteChallenges = new Map<string, DeleteChallenge>();

function isValidHexConfirmationCode(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{48}$/i.test(value.trim());
}

function pruneExpiredChallenges(now = Date.now()) {
  for (const [id, challenge] of deleteChallenges.entries()) {
    if (challenge.serverExpiresAt < now) {
      deleteChallenges.delete(id);
    }
  }
}

function codesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  }

  const limited = rateLimitResponse({
    body: {
      ok: false,
      message: "Muitas solicitações de confirmação. Aguarde um instante e tente novamente.",
    },
    identity: session.user.id,
    limit: 8,
    namespace: "delete-account-challenge",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  pruneExpiredChallenges();

  const challengeId = randomUUID();
  const code = randomBytes(24).toString("hex");
  const now = Date.now();
  const expiresAt = now + DELETE_CONFIRMATION_CLIENT_TTL_MS;
  const serverExpiresAt = now + DELETE_CONFIRMATION_SERVER_TTL_MS;

  deleteChallenges.set(challengeId, {
    code,
    expiresAt,
    serverExpiresAt,
    userId: session.user.id,
  });

  return Response.json({ ok: true, challengeId, code, expiresAt });
}

export async function DELETE(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  }

  const limited = rateLimitResponse({
    body: {
      ok: false,
      message: "Muitas tentativas de exclusão. Aguarde alguns minutos e tente novamente.",
    },
    identity: session.user.id,
    limit: 5,
    namespace: "delete-account",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const body = (await request.json().catch(() => null)) as {
    challengeId?: unknown;
    confirmationCode?: unknown;
  } | null;
  const challengeId =
    typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
  const confirmationCode =
    typeof body?.confirmationCode === "string"
      ? body.confirmationCode.trim()
      : "";
  const challenge = deleteChallenges.get(challengeId);

  if (!isValidHexConfirmationCode(confirmationCode) || !challenge) {
    return Response.json(
      { ok: false, message: "Código de confirmação inválido." },
      { status: 400 },
    );
  }

  if (
    challenge.userId !== session.user.id ||
    challenge.serverExpiresAt < Date.now() ||
    !codesMatch(challenge.code, confirmationCode)
  ) {
    deleteChallenges.delete(challengeId);

    return Response.json(
      { ok: false, message: "Código de confirmação inválido ou expirado." },
      { status: 400 },
    );
  }

  deleteChallenges.delete(challengeId);

  await leaveRoomsByAccountUserId(session.user.id);
  const deleted = await deleteUserAccount(session.user.id);

  if (!deleted) {
    return Response.json(
      { ok: false, message: "Usuário não encontrado." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
