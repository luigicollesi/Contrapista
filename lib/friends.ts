import "server-only";

import { PublicError } from "@/lib/api-response";
import { ensureUsersSchema } from "@/lib/auth-users";
import { dbQuery } from "@/lib/db";

export type FriendPresenceStatus = "offline" | "online";

export type FriendSummary = {
  friendshipId: string;
  presence: FriendPresenceStatus;
  userId: string;
  username: string;
  since: string;
};

export type FriendRequestSummary = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  id: string;
  status: string;
  userId: string;
  username: string;
};

export type FriendNotification = {
  createdAt: string;
  id: string;
  isUnread: boolean;
  message: string;
  inviteId?: string;
  requestId?: string;
  roomCode?: string;
  type: "friend_request" | "friend_added" | "room_invite";
  username: string;
};

export type FriendSearchResult = {
  relation:
    | "accepted"
    | "incoming_pending"
    | "none"
    | "outgoing_pending"
    | "self";
  presence: FriendPresenceStatus;
  userId: string;
  username: string;
};

export type FriendsDashboard = {
  friends: FriendSummary[];
  incomingRequests: FriendRequestSummary[];
  notifications: FriendNotification[];
  outgoingRequests: FriendRequestSummary[];
  unreadNotificationCount: number;
};

type UserRow = {
  id: string;
  username: string | null;
};

function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").slice(0, 32);
}

function friendRequestToSummary(
  row: {
    created_at: string;
    direction: "incoming" | "outgoing";
    id: string;
    status: string;
    user_id: string;
    username: string;
  },
): FriendRequestSummary {
  return {
    createdAt: row.created_at,
    direction: row.direction,
    id: row.id,
    status: row.status,
    userId: row.user_id,
    username: row.username,
  };
}

export async function ensureFriendsSchema() {
  await ensureUsersSchema();

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS user_friendships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_a_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (user_a_id <> user_b_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_friendships_pair_unique
      ON user_friendships (
        LEAST(user_a_id, user_b_id),
        GREATEST(user_a_id, user_b_id)
      );

    CREATE INDEX IF NOT EXISTS user_friendships_user_a_idx
      ON user_friendships (user_a_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS user_friendships_user_b_idx
      ON user_friendships (user_b_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_friend_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      responded_at timestamptz,
      CHECK (requester_id <> addressee_id),
      CHECK (status IN ('pending', 'accepted', 'declined', 'canceled'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS user_friend_requests_pending_pair_unique
      ON user_friend_requests (
        LEAST(requester_id, addressee_id),
        GREATEST(requester_id, addressee_id)
      )
      WHERE status = 'pending';

    CREATE INDEX IF NOT EXISTS user_friend_requests_addressee_idx
      ON user_friend_requests (addressee_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS user_friend_requests_requester_idx
      ON user_friend_requests (requester_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_presence (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS user_friend_invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_code text NOT NULL CHECK (room_code ~ '^[0-9]{4}$'),
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      responded_at timestamptz,
      CHECK (inviter_id <> invitee_id),
      CHECK (status IN ('pending', 'accepted', 'declined', 'canceled'))
    );

    CREATE INDEX IF NOT EXISTS user_friend_invites_invitee_idx
      ON user_friend_invites (invitee_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS user_friend_invites_inviter_idx
      ON user_friend_invites (inviter_id, status, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS user_friend_invites_pending_unique
      ON user_friend_invites (inviter_id, invitee_id, room_code)
      WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS user_notification_states (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz,
      deleted_at timestamptz,
      PRIMARY KEY (user_id, notification_key)
    );

    CREATE INDEX IF NOT EXISTS user_notification_states_user_unread_idx
      ON user_notification_states (user_id, read_at, deleted_at);
  `);
}

export async function touchUserPresence(userId: string) {
  await ensureFriendsSchema();

  await dbQuery(
    `
      INSERT INTO user_presence (user_id, last_seen_at, updated_at)
      VALUES ($1::uuid, now(), now())
      ON CONFLICT (user_id) DO UPDATE
      SET last_seen_at = now(),
          updated_at = now()
    `,
    [userId],
  );
}

async function applyNotificationState({
  markRead,
  notifications,
  userId,
}: {
  markRead: boolean;
  notifications: Array<Omit<FriendNotification, "isUnread">>;
  userId: string;
}) {
  if (!notifications.length) {
    return {
      notifications: [] as FriendNotification[],
      unreadNotificationCount: 0,
    };
  }

  const keys = notifications.map((notification) => notification.id);

  await dbQuery(
    `
      INSERT INTO user_notification_states (user_id, notification_key)
      SELECT $1::uuid, unnest($2::text[])
      ON CONFLICT DO NOTHING
    `,
    [userId, keys],
  );

  if (markRead) {
    await dbQuery(
      `
        UPDATE user_notification_states
        SET read_at = COALESCE(read_at, now())
        WHERE user_id = $1::uuid
          AND notification_key = ANY($2::text[])
          AND deleted_at IS NULL
      `,
      [userId, keys],
    );
  }

  const stateResult = await dbQuery<{
    deleted_at: string | null;
    notification_key: string;
    read_at: string | null;
  }>(
    `
      SELECT notification_key, read_at::text AS read_at, deleted_at::text AS deleted_at
      FROM user_notification_states
      WHERE user_id = $1::uuid
        AND notification_key = ANY($2::text[])
    `,
    [userId, keys],
  );
  const stateByKey = new Map(
    stateResult.rows.map((row) => [row.notification_key, row]),
  );
  const visibleNotifications = notifications
    .filter((notification) => !stateByKey.get(notification.id)?.deleted_at)
    .map((notification) => ({
      ...notification,
      isUnread: !stateByKey.get(notification.id)?.read_at,
    }));

  return {
    notifications: visibleNotifications,
    unreadNotificationCount: visibleNotifications.filter(
      (notification) => notification.isUnread,
    ).length,
  };
}

async function markNotificationReadForUser({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}) {
  await dbQuery(
    `
      INSERT INTO user_notification_states (
        user_id,
        notification_key,
        read_at
      )
      VALUES ($1::uuid, $2, now())
      ON CONFLICT (user_id, notification_key) DO UPDATE
      SET read_at = COALESCE(user_notification_states.read_at, now()),
          deleted_at = NULL
    `,
    [userId, notificationId],
  );
}

export async function getFriendsDashboard(
  userId: string,
  { markNotificationsRead = false } = {},
): Promise<FriendsDashboard> {
  await ensureFriendsSchema();

  const [
    friendsResult,
    requestsResult,
    recentFriendsResult,
    roomInvitesResult,
  ] = await Promise.all([
    dbQuery<{
      friendship_id: string;
      friend_id: string;
      presence: FriendPresenceStatus;
      since: string;
      username: string;
    }>(
      `
        SELECT
          friendship.id::text AS friendship_id,
          friend.id::text AS friend_id,
          friend.username,
          CASE
            WHEN presence.last_seen_at > now() - interval '2 minutes'
              THEN 'online'
            ELSE 'offline'
          END AS presence,
          friendship.created_at::text AS since
        FROM user_friendships friendship
        JOIN users friend
          ON friend.id = CASE
            WHEN friendship.user_a_id = $1::uuid THEN friendship.user_b_id
            ELSE friendship.user_a_id
          END
        LEFT JOIN user_presence presence
          ON presence.user_id = friend.id
        WHERE friendship.user_a_id = $1::uuid
           OR friendship.user_b_id = $1::uuid
        ORDER BY friendship.created_at DESC
        LIMIT 80
      `,
      [userId],
    ),
    dbQuery<{
      created_at: string;
      direction: "incoming" | "outgoing";
      id: string;
      status: string;
      user_id: string;
      username: string;
    }>(
      `
        SELECT
          request.id::text AS id,
          request.status,
          request.created_at::text AS created_at,
          CASE
            WHEN request.addressee_id = $1::uuid THEN 'incoming'
            ELSE 'outgoing'
          END AS direction,
          other_user.id::text AS user_id,
          other_user.username
        FROM user_friend_requests request
        JOIN users other_user
          ON other_user.id = CASE
            WHEN request.addressee_id = $1::uuid THEN request.requester_id
            ELSE request.addressee_id
          END
        WHERE request.status = 'pending'
          AND (request.addressee_id = $1::uuid OR request.requester_id = $1::uuid)
        ORDER BY request.created_at DESC
        LIMIT 80
      `,
      [userId],
    ),
    dbQuery<{
      friendship_id: string;
      since: string;
      username: string;
    }>(
      `
        SELECT
          friendship.id::text AS friendship_id,
          friend.username,
          friendship.created_at::text AS since
        FROM user_friendships friendship
        JOIN users friend
          ON friend.id = CASE
            WHEN friendship.user_a_id = $1::uuid THEN friendship.user_b_id
            ELSE friendship.user_a_id
          END
        WHERE friendship.created_at > now() - interval '14 days'
          AND (friendship.user_a_id = $1::uuid OR friendship.user_b_id = $1::uuid)
        ORDER BY friendship.created_at DESC
        LIMIT 10
      `,
      [userId],
    ),
    dbQuery<{
      created_at: string;
      id: string;
      room_code: string;
      username: string;
    }>(
      `
        SELECT
          invite.id::text AS id,
          invite.room_code,
          invite.created_at::text AS created_at,
          inviter.username
        FROM user_friend_invites invite
        JOIN users inviter ON inviter.id = invite.inviter_id
        WHERE invite.invitee_id = $1::uuid
          AND invite.status = 'pending'
        ORDER BY invite.created_at DESC
        LIMIT 20
      `,
      [userId],
    ),
  ]);

  const friends = friendsResult.rows.map((row) => ({
    friendshipId: row.friendship_id,
    presence: row.presence,
    userId: row.friend_id,
    username: row.username,
    since: row.since,
  }));
  const requests = requestsResult.rows.map(friendRequestToSummary);
  const incomingRequests = requests.filter((request) => request.direction === "incoming");
  const outgoingRequests = requests.filter((request) => request.direction === "outgoing");
  const rawNotifications: Array<Omit<FriendNotification, "isUnread">> = [
    ...roomInvitesResult.rows.map((invite) => ({
      createdAt: invite.created_at,
      id: `invite:${invite.id}`,
      inviteId: invite.id,
      message: `${invite.username} chamou você para a mesa ${invite.room_code}.`,
      roomCode: invite.room_code,
      type: "room_invite" as const,
      username: invite.username,
    })),
    ...incomingRequests.map((request) => ({
      createdAt: request.createdAt,
      id: `request:${request.id}`,
      message: `${request.username} quer entrar na sua rede.`,
      requestId: request.id,
      type: "friend_request" as const,
      username: request.username,
    })),
    ...recentFriendsResult.rows.map((row) => ({
      createdAt: row.since,
      id: `friend:${row.friendship_id}`,
      message: `${row.username} agora está na sua rede.`,
      type: "friend_added" as const,
      username: row.username,
    })),
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const notificationState = await applyNotificationState({
    markRead: markNotificationsRead,
    notifications: rawNotifications,
    userId,
  });

  return {
    friends,
    incomingRequests,
    notifications: notificationState.notifications,
    outgoingRequests,
    unreadNotificationCount: notificationState.unreadNotificationCount,
  };
}

export async function getUnreadNotificationCount(userId: string) {
  const dashboard = await getFriendsDashboard(userId);

  return dashboard.unreadNotificationCount;
}

export async function getUnreadNotifications(userId: string) {
  const dashboard = await getFriendsDashboard(userId);

  return dashboard.notifications.filter((notification) => notification.isUnread);
}

export async function markVisibleFriendNotificationsRead(userId: string) {
  return getFriendsDashboard(userId, { markNotificationsRead: true });
}

export async function searchFriendCandidates({
  query,
  userId,
}: {
  query: string;
  userId: string;
}): Promise<FriendSearchResult[]> {
  await ensureFriendsSchema();

  const normalizedQuery = normalizeSearchQuery(query);

  if (normalizedQuery.length < 2) {
    return [];
  }

  const result = await dbQuery<{
    presence: FriendPresenceStatus;
    relation: FriendSearchResult["relation"];
    user_id: string;
    username: string;
  }>(
    `
      SELECT
        found_user.id::text AS user_id,
        found_user.username,
        CASE
          WHEN presence.last_seen_at > now() - interval '2 minutes'
            THEN 'online'
          ELSE 'offline'
        END AS presence,
        CASE
          WHEN found_user.id = $1::uuid THEN 'self'
          WHEN friendship.id IS NOT NULL THEN 'accepted'
          WHEN incoming_request.id IS NOT NULL THEN 'incoming_pending'
          WHEN outgoing_request.id IS NOT NULL THEN 'outgoing_pending'
          ELSE 'none'
        END AS relation
      FROM users found_user
      LEFT JOIN user_friendships friendship
        ON (
          LEAST(friendship.user_a_id, friendship.user_b_id) =
          LEAST($1::uuid, found_user.id)
          AND GREATEST(friendship.user_a_id, friendship.user_b_id) =
          GREATEST($1::uuid, found_user.id)
        )
      LEFT JOIN user_friend_requests incoming_request
        ON incoming_request.requester_id = found_user.id
       AND incoming_request.addressee_id = $1::uuid
       AND incoming_request.status = 'pending'
      LEFT JOIN user_friend_requests outgoing_request
        ON outgoing_request.requester_id = $1::uuid
       AND outgoing_request.addressee_id = found_user.id
       AND outgoing_request.status = 'pending'
      LEFT JOIN user_presence presence
        ON presence.user_id = found_user.id
      WHERE found_user.username IS NOT NULL
        AND found_user.terms_accepted = true
        AND found_user.privacy_acknowledged = true
        AND lower(found_user.username) LIKE lower($2)
      ORDER BY
        CASE WHEN lower(found_user.username) = lower($3) THEN 0 ELSE 1 END,
        found_user.username ASC
      LIMIT 12
    `,
    [userId, `%${normalizedQuery}%`, normalizedQuery],
  );

  return result.rows.map((row) => ({
    presence: row.presence,
    relation: row.relation,
    userId: row.user_id,
    username: row.username,
  }));
}

async function findUserByUsername(username: string) {
  const normalized = normalizeSearchQuery(username);

  if (normalized.length < 2) {
    return null;
  }

  const result = await dbQuery<UserRow>(
    `
      SELECT id::text AS id, username
      FROM users
      WHERE lower(btrim(username)) = lower(btrim($1))
      LIMIT 1
    `,
    [normalized],
  );

  return result.rows[0] ?? null;
}

export async function sendFriendRequest({
  targetUsername,
  userId,
}: {
  targetUsername: string;
  userId: string;
}) {
  await ensureFriendsSchema();

  const target = await findUserByUsername(targetUsername);

  if (!target?.username) {
    throw new PublicError("Não encontramos esse nome.", 404);
  }

  if (target.id === userId) {
    throw new PublicError("Você já está no próprio arquivo.");
  }

  const friendship = await dbQuery(
    `
      SELECT id
      FROM user_friendships
      WHERE LEAST(user_a_id, user_b_id) = LEAST($1::uuid, $2::uuid)
        AND GREATEST(user_a_id, user_b_id) = GREATEST($1::uuid, $2::uuid)
      LIMIT 1
    `,
    [userId, target.id],
  );

  if (friendship.rowCount) {
    throw new PublicError("Esse nome já está na sua rede.");
  }

  const incoming = await dbQuery<{ id: string }>(
    `
      SELECT id::text AS id
      FROM user_friend_requests
      WHERE requester_id = $2::uuid
        AND addressee_id = $1::uuid
        AND status = 'pending'
      LIMIT 1
    `,
    [userId, target.id],
  );

  if (incoming.rows[0]?.id) {
    return respondToFriendRequest({
      action: "accept",
      requestId: incoming.rows[0].id,
      userId,
    });
  }

  const result = await dbQuery(
    `
      INSERT INTO user_friend_requests (requester_id, addressee_id)
      VALUES ($1::uuid, $2::uuid)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    [userId, target.id],
  );

  if (!result.rowCount) {
    throw new PublicError("Pedido já enviado.");
  }

  return getFriendsDashboard(userId);
}

export async function respondToFriendRequest({
  action,
  requestId,
  userId,
}: {
  action: "accept" | "decline";
  requestId: string;
  userId: string;
}) {
  await ensureFriendsSchema();

  const requestResult = await dbQuery<{
    addressee_id: string;
    requester_id: string;
  }>(
    `
      SELECT requester_id::text AS requester_id, addressee_id::text AS addressee_id
      FROM user_friend_requests
      WHERE id = $1::uuid
        AND addressee_id = $2::uuid
        AND status = 'pending'
      LIMIT 1
    `,
    [requestId, userId],
  );
  const request = requestResult.rows[0];

  if (!request) {
    throw new PublicError("Pedido não encontrado.", 404);
  }

  if (action === "accept") {
    const friendshipResult = await dbQuery<{ id: string }>(
      `
        INSERT INTO user_friendships (user_a_id, user_b_id)
        VALUES ($1::uuid, $2::uuid)
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id
      `,
      [request.requester_id, request.addressee_id],
    );
    const friendshipId =
      friendshipResult.rows[0]?.id ??
      (
        await dbQuery<{ id: string }>(
          `
            SELECT id::text AS id
            FROM user_friendships
            WHERE LEAST(user_a_id, user_b_id) = LEAST($1::uuid, $2::uuid)
              AND GREATEST(user_a_id, user_b_id) = GREATEST($1::uuid, $2::uuid)
            LIMIT 1
          `,
          [request.requester_id, request.addressee_id],
        )
      ).rows[0]?.id;

    if (friendshipId) {
      await markNotificationReadForUser({
        notificationId: `friend:${friendshipId}`,
        userId,
      });
    }
  }

  await dbQuery(
    `
      UPDATE user_friend_requests
      SET status = $3,
          responded_at = now(),
          updated_at = now()
      WHERE id = $1::uuid
        AND addressee_id = $2::uuid
    `,
    [requestId, userId, action === "accept" ? "accepted" : "declined"],
  );

  return getFriendsDashboard(userId);
}

export async function cancelFriendRequest({
  requestId,
  userId,
}: {
  requestId: string;
  userId: string;
}) {
  await ensureFriendsSchema();

  const result = await dbQuery(
    `
      UPDATE user_friend_requests
      SET status = 'canceled',
          responded_at = now(),
          updated_at = now()
      WHERE id = $1::uuid
        AND requester_id = $2::uuid
        AND status = 'pending'
    `,
    [requestId, userId],
  );

  if (!result.rowCount) {
    throw new PublicError("Pedido não encontrado.", 404);
  }

  return getFriendsDashboard(userId);
}

export async function removeFriend({
  friendUserId,
  userId,
}: {
  friendUserId: string;
  userId: string;
}) {
  await ensureFriendsSchema();

  const result = await dbQuery(
    `
      DELETE FROM user_friendships
      WHERE LEAST(user_a_id, user_b_id) = LEAST($1::uuid, $2::uuid)
        AND GREATEST(user_a_id, user_b_id) = GREATEST($1::uuid, $2::uuid)
    `,
    [userId, friendUserId],
  );

  if (!result.rowCount) {
    throw new PublicError("Amizade não encontrada.", 404);
  }

  return getFriendsDashboard(userId);
}

async function assertFriendship({
  friendUserId,
  userId,
}: {
  friendUserId: string;
  userId: string;
}) {
  const result = await dbQuery(
    `
      SELECT id
      FROM user_friendships
      WHERE LEAST(user_a_id, user_b_id) = LEAST($1::uuid, $2::uuid)
        AND GREATEST(user_a_id, user_b_id) = GREATEST($1::uuid, $2::uuid)
      LIMIT 1
    `,
    [userId, friendUserId],
  );

  if (!result.rowCount) {
    throw new PublicError("Convite disponível apenas para amigos.", 403);
  }
}

export async function sendRoomInvite({
  friendUserId,
  roomCode,
  userId,
}: {
  friendUserId: string;
  roomCode: string;
  userId: string;
}) {
  await ensureFriendsSchema();

  if (!/^\d{4}$/.test(roomCode)) {
    throw new PublicError("Código da sala inválido.");
  }

  if (friendUserId === userId) {
    throw new PublicError("Escolha outro jogador para convidar.");
  }

  await assertFriendship({ friendUserId, userId });

  const result = await dbQuery(
    `
      INSERT INTO user_friend_invites (inviter_id, invitee_id, room_code)
      VALUES ($1::uuid, $2::uuid, $3)
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
    [userId, friendUserId, roomCode],
  );

  if (!result.rowCount) {
    throw new PublicError("Convite já enviado para essa mesa.");
  }

  return getFriendsDashboard(userId);
}

export async function respondToRoomInvite({
  action,
  inviteId,
  userId,
}: {
  action: "accept" | "decline";
  inviteId: string;
  userId: string;
}) {
  await ensureFriendsSchema();

  const result = await dbQuery(
    `
      UPDATE user_friend_invites
      SET status = $3,
          responded_at = now(),
          updated_at = now()
      WHERE id = $1::uuid
        AND invitee_id = $2::uuid
        AND status = 'pending'
    `,
    [inviteId, userId, action === "accept" ? "accepted" : "declined"],
  );

  if (!result.rowCount) {
    throw new PublicError("Convite não encontrado.", 404);
  }

  await markNotificationReadForUser({
    notificationId: `invite:${inviteId}`,
    userId,
  });

  return getFriendsDashboard(userId);
}

export async function deleteFriendNotification({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}) {
  await ensureFriendsSchema();

  const dashboard = await getFriendsDashboard(userId);
  const notification = dashboard.notifications.find(
    (item) => item.id === notificationId,
  );

  if (!notification) {
    throw new PublicError("Notificação não encontrada.", 404);
  }

  if (notification.requestId || notification.inviteId) {
    throw new PublicError("Responda ao aviso antes de removê-lo.");
  }

  await dbQuery(
    `
      UPDATE user_notification_states
      SET deleted_at = COALESCE(deleted_at, now()),
          read_at = COALESCE(read_at, now())
      WHERE user_id = $1::uuid
        AND notification_key = $2
    `,
    [userId, notificationId],
  );

  return getFriendsDashboard(userId, { markNotificationsRead: true });
}
