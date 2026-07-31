import "server-only";

import { auth } from "@/auth";
import { isRoomUserAuthorized } from "@/lib/rooms";
import { hashIdentifier, logSecurityEvent } from "@/lib/security/audit-log";

type RoomUserAuthorizationOptions = {
  action: string;
  code: string;
  userId: string;
};

export async function requireAuthorizedRoomUser({
  action,
  code,
  userId,
}: RoomUserAuthorizationOptions) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return Response.json(
      { error: "Faça login para continuar." },
      { status: 401 },
    );
  }

  const authorized = await isRoomUserAuthorized({
    accountUserId: session.user.id,
    code,
    nickname: session.user.name,
    userId,
  });

  if (!authorized) {
    logSecurityEvent("authorization", {
      action,
      code,
      roomUser: hashIdentifier(userId),
      sessionUser: hashIdentifier(session.user.id),
    });

    return Response.json(
      { error: "Ação não permitida para este usuário." },
      { status: 403 },
    );
  }

  return null;
}
