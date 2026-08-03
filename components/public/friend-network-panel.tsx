"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { withCsrfHeader } from "@/lib/client-http";
import {
  getBrowserId,
  saveSession,
} from "@/lib/client-session";

type PresenceStatus = "offline" | "online";

type FriendSummary = {
  friendshipId: string;
  presence: PresenceStatus;
  since: string;
  userId: string;
  username: string;
};

type FriendRequestSummary = {
  createdAt: string;
  direction: "incoming" | "outgoing";
  id: string;
  status: string;
  userId: string;
  username: string;
};

type FriendNotification = {
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

type FriendSearchResult = {
  relation:
    | "accepted"
    | "incoming_pending"
    | "none"
    | "outgoing_pending"
    | "self";
  presence: PresenceStatus;
  userId: string;
  username: string;
};

type FriendsDashboard = {
  friends: FriendSummary[];
  incomingRequests: FriendRequestSummary[];
  notifications: FriendNotification[];
  outgoingRequests: FriendRequestSummary[];
  unreadNotificationCount: number;
};

type FriendsResponse = {
  dashboard?: FriendsDashboard;
  error?: string;
  message?: string;
  ok?: boolean;
  results?: FriendSearchResult[];
  unreadNotificationCount?: number;
};

type JoinRoomResponse = {
  error?: string;
  message?: string;
  room?: {
    code: string;
  };
  user?: {
    browserId?: string;
    color?: string | null;
    id: string;
    nickname?: string | null;
  };
};

type FriendNetworkPanelProps = {
  action?: "invite" | "none" | "play";
  compact?: boolean;
  excludedUserIds?: string[];
  onUnreadCountChange?: (count: number) => void;
  roomCode?: string;
  showSearch?: boolean;
  view: "friends" | "notifications";
};

type FriendNetworkTabsProps = {
  compact?: boolean;
};

function emptyDashboard(): FriendsDashboard {
  return {
    friends: [],
    incomingRequests: [],
    notifications: [],
    outgoingRequests: [],
    unreadNotificationCount: 0,
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function relationLabel(relation: FriendSearchResult["relation"]) {
  if (relation === "accepted") {
    return "Na rede";
  }

  if (relation === "incoming_pending") {
    return "Pedido recebido";
  }

  if (relation === "outgoing_pending") {
    return "Pedido enviado";
  }

  if (relation === "self") {
    return "Você";
  }

  return "Adicionar";
}

function presenceLabel(presence: PresenceStatus) {
  return presence === "online" ? "Online" : "Offline";
}

function presenceClass(presence: PresenceStatus) {
  return presence === "online"
    ? "border-emerald-300/35 bg-emerald-950/35 text-emerald-100"
    : "border-stone-500/25 bg-stone-950/35 text-stone-400";
}

function NotificationCountBadge({
  count,
  compact = false,
}: {
  count: number;
  compact?: boolean;
}) {
  if (count <= 0) {
    return null;
  }

  return (
    <span
      className={`absolute -right-4 -top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black leading-5 text-white shadow-lg shadow-black/30 ${
        compact ? "scale-90" : ""
      }`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

async function readFriendsResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as FriendsResponse;

  if (!response.ok || payload.ok === false) {
    throw new Error(
      payload.error ?? payload.message ?? "Não deu para atualizar sua rede.",
    );
  }

  return payload;
}

export function FriendNetworkPanel({
  action = "play",
  compact = false,
  excludedUserIds = [],
  onUnreadCountChange,
  roomCode,
  showSearch = true,
  view,
}: FriendNetworkPanelProps) {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<FriendsDashboard>(emptyDashboard);
  const [confirmingRemoveFriendId, setConfirmingRemoveFriendId] = useState<
    string | null
  >(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendSearchResult[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const canSearch = query.trim().length >= 2;
  const visibleFriends = compact
    ? dashboard.friends
        .filter((friend) => !excludedUserIds.includes(friend.userId))
        .slice(0, 4)
    : dashboard.friends.filter((friend) => !excludedUserIds.includes(friend.userId));
  const visibleNotifications = compact
    ? dashboard.notifications.slice(0, 4)
    : dashboard.notifications;

  const loadDashboard = useCallback(async () => {
    const shouldReadNotifications = view === "notifications";
    const response = shouldReadNotifications
      ? await fetch(
          "/api/users/me/friends/notifications/read",
          withCsrfHeader({ method: "POST" }),
        )
      : await fetch("/api/users/me/friends", { cache: "no-store" });
    const payload = await readFriendsResponse(response);
    const nextDashboard = payload.dashboard ?? emptyDashboard();

    setDashboard(nextDashboard);
    onUnreadCountChange?.(nextDashboard.unreadNotificationCount);
  }, [onUnreadCountChange, view]);

  useEffect(() => {
    let ignore = false;
    const timeout = window.setTimeout(() => {
      loadDashboard()
        .catch((error) => {
          if (!ignore) {
            setMessage(error instanceof Error ? error.message : "Não deu para abrir sua rede.");
          }
        })
        .finally(() => {
          if (!ignore) {
            setIsLoading(false);
          }
        });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [loadDashboard]);

  function refreshFromPayload(payload: FriendsResponse) {
    if (payload.dashboard) {
      setDashboard(payload.dashboard);
      onUnreadCountChange?.(payload.dashboard.unreadNotificationCount);
    }
  }

  function searchFriends() {
    if (!canSearch) {
      setResults([]);
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/users/me/friends?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store" },
        );
        const payload = await readFriendsResponse(response);

        setResults(payload.results ?? []);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Busca indisponível.");
      }
    });
  }

  function sendRequest(username: string) {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/users/me/friends", withCsrfHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        }));
        const payload = await readFriendsResponse(response);

        refreshFromPayload(payload);
        setMessage("Pedido enviado.");
        setQuery("");
        setResults([]);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Pedido indisponível.");
      }
    });
  }

  function respondToRequest(requestId: string, action: "accept" | "decline") {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/users/me/friends/${requestId}`,
          withCsrfHeader({
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }),
        );
        const payload = await readFriendsResponse(response);

        refreshFromPayload(payload);
        setMessage(action === "accept" ? "Amizade aceita." : "Pedido recusado.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Resposta indisponível.");
      }
    });
  }

  function cancelRequest(requestId: string) {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/users/me/friends/${requestId}`,
          withCsrfHeader({ method: "DELETE" }),
        );
        const payload = await readFriendsResponse(response);

        refreshFromPayload(payload);
        setMessage("Pedido cancelado.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ação indisponível.");
      }
    });
  }

  function removeFriend(friend: FriendSummary) {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/users/me/friends/${friend.friendshipId}?friendUserId=${encodeURIComponent(friend.userId)}`,
          withCsrfHeader({ method: "DELETE" }),
        );
        const payload = await readFriendsResponse(response);

        refreshFromPayload(payload);
        setConfirmingRemoveFriendId(null);
        setMessage(`${friend.username} saiu da sua rede.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Ação indisponível.");
      }
    });
  }

  function inviteFriend(friend: FriendSummary) {
    if (!roomCode) {
      setMessage("Sala indisponível para convite.");
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/users/me/friends/invites", withCsrfHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            friendUserId: friend.userId,
            roomCode,
          }),
        }));
        const payload = await readFriendsResponse(response);

        refreshFromPayload(payload);
        setMessage(`Convite enviado para ${friend.username}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Convite indisponível.");
      }
    });
  }

  function playWithFriend(friend: FriendSummary) {
    setMessage("");
    startTransition(async () => {
      try {
        const roomResponse = await fetch("/api/rooms", withCsrfHeader({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browserId: getBrowserId() }),
        }));
        const roomPayload = (await roomResponse
          .json()
          .catch(() => ({}))) as JoinRoomResponse;

        if (!roomResponse.ok || !roomPayload.room || !roomPayload.user) {
          throw new Error(
            roomPayload.error ??
              roomPayload.message ??
              "Não deu para criar a sala.",
          );
        }

        const inviteResponse = await fetch(
          "/api/users/me/friends/invites",
          withCsrfHeader({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              friendUserId: friend.userId,
              roomCode: roomPayload.room.code,
            }),
          }),
        );
        await readFriendsResponse(inviteResponse);

        saveSession({
          roomCode: roomPayload.room.code,
          user: roomPayload.user,
        });
        router.push(`/sala/${roomPayload.room.code}`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Jogo indisponível.");
      }
    });
  }

  function respondToRoomInvite(
    notification: FriendNotification,
    action: "accept" | "decline",
  ) {
    if (!notification.inviteId) {
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        if (action === "accept") {
          if (!notification.roomCode) {
            throw new Error("Convite sem código de sala.");
          }

          const joinResponse = await fetch(
            `/api/rooms/${notification.roomCode}/join`,
            withCsrfHeader({
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ browserId: getBrowserId() }),
            }),
          );
          const joinPayload = (await joinResponse
            .json()
            .catch(() => ({}))) as JoinRoomResponse;

          if (!joinResponse.ok || !joinPayload.room || !joinPayload.user) {
            throw new Error(
              joinPayload.error ??
                joinPayload.message ??
                "Não deu para entrar nessa sala.",
            );
          }

          saveSession({
            roomCode: joinPayload.room.code,
            user: joinPayload.user,
          });
        }

        const response = await fetch(
          `/api/users/me/friends/invites/${notification.inviteId}`,
          withCsrfHeader({
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }),
        );
        const payload = await readFriendsResponse(response);

        refreshFromPayload(payload);

        if (action === "accept" && notification.roomCode) {
          router.push(`/sala/${notification.roomCode}`);
          return;
        }

        setMessage("Convite recusado.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Convite indisponível.");
      }
    });
  }

  function deleteNotification(notification: FriendNotification) {
    setMessage("");
    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/users/me/friends/notifications/${encodeURIComponent(notification.id)}`,
          withCsrfHeader({ method: "DELETE" }),
        );
        const payload = await readFriendsResponse(response);

        refreshFromPayload(payload);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Aviso indisponível.");
      }
    });
  }

  const panelClass = compact
    ? "mt-4 space-y-3 text-sm"
    : "mt-5 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a] p-5 shadow-2xl shadow-black/20 sm:p-6";
  const itemClass = compact
    ? "rounded-sm border border-[#d0a85c]/20 bg-[#0e1111] p-3"
    : "rounded-sm border border-[#d0a85c]/20 bg-[#0e1111] p-4";

  if (isLoading) {
    return (
      <div className={panelClass}>
        <p className="text-sm text-stone-400">Abrindo rede...</p>
      </div>
    );
  }

  return (
    <div className={panelClass}>
      {view === "friends" ? (
        <>
          {showSearch ? (
            <div
              className={compact ? "space-y-2" : "grid gap-3 sm:grid-cols-[1fr_auto]"}
            >
              <input
                className="h-11 w-full rounded-sm border border-[#d0a85c]/30 bg-[#0e1111] px-3 text-sm text-stone-50 outline-none transition placeholder:text-stone-600 focus:border-[#d0a85c] focus:ring-2 focus:ring-[#d0a85c]/20"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    searchFriends();
                  }
                }}
                placeholder="Buscar por nome público"
                value={query}
              />
              <button
                className="h-11 w-full rounded-sm bg-[#d0a85c] px-4 text-sm font-black uppercase tracking-[0.14em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
                disabled={!canSearch || isPending}
                onClick={searchFriends}
                type="button"
              >
                Procurar
              </button>
            </div>
          ) : null}

          {showSearch && results.length ? (
            <div className="mt-4 grid gap-2">
              {results.map((result) => (
                <div className={itemClass} key={result.userId}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-serif text-lg font-bold text-[#f2e6c8]">
                        {result.username}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                          {relationLabel(result.relation)}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${presenceClass(result.presence)}`}
                        >
                          {presenceLabel(result.presence)}
                        </span>
                      </div>
                    </div>
                    {result.relation === "none" ? (
                      <button
                        className="shrink-0 rounded-sm border border-[#d0a85c]/45 px-3 py-2 text-xs font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => sendRequest(result.username)}
                        type="button"
                      >
                        Adicionar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5">
            <div className="flex items-end justify-between gap-3">
              <h3 className="font-serif text-xl font-bold text-[#f2e6c8]">
                Amigos
              </h3>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#d0a85c]">
                {dashboard.friends.length}
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {visibleFriends.length ? (
                visibleFriends.map((friend) => (
                  <div className={itemClass} key={friend.friendshipId}>
                    {confirmingRemoveFriendId === friend.userId ? (
                      <div className="mb-3 rounded-sm border border-red-400/25 bg-red-950/20 px-3 py-2 text-xs text-red-100">
                        <p className="font-semibold">
                          Desfazer amizade com {friend.username}?
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            className="rounded-sm bg-red-400 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-red-950 transition hover:bg-red-300 disabled:opacity-60"
                            disabled={isPending}
                            onClick={() => removeFriend(friend)}
                            type="button"
                          >
                            Confirmar
                          </button>
                          <button
                            className="rounded-sm border border-stone-600 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-300 transition hover:bg-white/5 disabled:opacity-60"
                            disabled={isPending}
                            onClick={() => setConfirmingRemoveFriendId(null)}
                            type="button"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-serif text-lg font-bold text-[#f2e6c8]">
                          {friend.username}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${presenceClass(friend.presence)}`}
                          >
                            {presenceLabel(friend.presence)}
                          </span>
                          <span className="text-xs text-stone-500">
                            Desde {formatDate(friend.since)}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {action === "invite" ? (
                          <button
                            className="rounded-sm border border-[#d0a85c]/45 px-3 py-2 text-xs font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isPending || friend.presence !== "online"}
                            onClick={() => inviteFriend(friend)}
                            type="button"
                          >
                            Convidar
                          </button>
                        ) : null}
                        {action === "play" ? (
                          <button
                            className="rounded-sm bg-[#d0a85c] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={isPending || friend.presence !== "online"}
                            onClick={() => playWithFriend(friend)}
                            type="button"
                          >
                            Jogar
                          </button>
                        ) : null}
                        <button
                          aria-label={`Desfazer amizade com ${friend.username}`}
                          className="shrink-0 rounded-sm border border-stone-700 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 transition hover:border-red-400/45 hover:bg-red-950/20 hover:text-red-100 disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => setConfirmingRemoveFriendId(friend.userId)}
                          type="button"
                        >
                          Desfazer
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-sm border border-dashed border-[#d0a85c]/20 p-4 text-sm text-stone-400">
                  Sua rede ainda está vazia.
                </p>
              )}
            </div>
          </div>

          {showSearch && dashboard.outgoingRequests.length ? (
            <div className="mt-5">
              <h3 className="font-serif text-xl font-bold text-[#f2e6c8]">
                Convites enviados
              </h3>
              <div className="mt-3 grid gap-2">
                {dashboard.outgoingRequests.map((request) => (
                  <div className={itemClass} key={request.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-stone-200">
                        {request.username}
                      </p>
                      <button
                        className="shrink-0 rounded-sm border border-[#d0a85c]/35 px-3 py-2 text-xs font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => cancelRequest(request.id)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <h3 className="font-serif text-xl font-bold text-[#f2e6c8]">
              Notificações
            </h3>
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#d0a85c]">
              {dashboard.notifications.length}
            </span>
          </div>
          <div className="mt-3 grid gap-2">
            {visibleNotifications.length ? (
              visibleNotifications.map((notification) => (
                <div className={itemClass} key={notification.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-200">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.requestId && !notification.inviteId ? (
                      <button
                        className="shrink-0 rounded-sm border border-stone-700 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400 transition hover:border-red-400/45 hover:text-red-100 disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => deleteNotification(notification)}
                        type="button"
                      >
                        Apagar
                      </button>
                    ) : null}
                  </div>
                  {notification.type === "room_invite" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-sm bg-[#d0a85c] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => respondToRoomInvite(notification, "accept")}
                        type="button"
                      >
                        Entrar
                      </button>
                      <button
                        className="rounded-sm border border-red-400/40 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-950/35 disabled:opacity-60"
                        disabled={isPending}
                        onClick={() => respondToRoomInvite(notification, "decline")}
                        type="button"
                      >
                        Recusar
                      </button>
                    </div>
                  ) : null}
                  {notification.requestId ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-sm bg-[#d0a85c] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:opacity-60"
                        disabled={isPending}
                        onClick={() =>
                          respondToRequest(notification.requestId ?? "", "accept")
                        }
                        type="button"
                      >
                        Aceitar
                      </button>
                      <button
                        className="rounded-sm border border-red-400/40 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-950/35 disabled:opacity-60"
                        disabled={isPending}
                        onClick={() =>
                          respondToRequest(notification.requestId ?? "", "decline")
                        }
                        type="button"
                      >
                        Recusar
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="rounded-sm border border-dashed border-[#d0a85c]/20 p-4 text-sm text-stone-400">
                Nenhum novo sinal.
              </p>
            )}
          </div>
        </>
      )}

      {message ? (
        <p className="mt-4 rounded-sm border border-[#d0a85c]/25 bg-[#2a2112] px-3 py-2 text-sm font-semibold text-[#f5e7bd]">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function FriendNetworkTabs({ compact = false }: FriendNetworkTabsProps) {
  const [activeTab, setActiveTab] = useState<"friends" | "notifications">(
    "friends",
  );
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const tabs = useMemo(
    () => [
      ["friends", "Amizades"],
      ["notifications", "Notificações"],
    ] as const,
    [],
  );

  return (
    <section className={compact ? "" : "mt-10 border-t border-[#d0a85c]/25 pt-8"}>
      {!compact ? (
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
            Rede
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]">
            Aliados de investigação
          </h2>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {tabs.map(([id, label]) => (
          <button
            className={`h-10 rounded-sm border px-3 text-xs font-black uppercase tracking-[0.12em] transition ${
              activeTab === id
                ? "border-[#d0a85c] bg-[#d0a85c] text-[#17130d]"
                : "border-[#d0a85c]/30 text-[#f5e7bd] hover:bg-[#d0a85c]/10"
            }`}
            key={id}
            onClick={() => setActiveTab(id)}
            type="button"
          >
            <span className="relative inline-flex items-center justify-center">
              {label}
              {id === "notifications" ? (
                <NotificationCountBadge
                  compact
                  count={unreadNotificationCount}
                />
              ) : null}
            </span>
          </button>
        ))}
      </div>
      <FriendNetworkPanel
        compact={compact}
        onUnreadCountChange={setUnreadNotificationCount}
        view={activeTab}
      />
    </section>
  );
}
