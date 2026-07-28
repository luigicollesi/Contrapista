"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  PLAYER_COLORS,
  type PlayerColor,
} from "@/lib/player-colors";

type RoomUser = {
  id: string;
  nickname: string;
  color: PlayerColor;
  ready: boolean;
};

type Room = {
  code: string;
  users: RoomUser[];
  userCount: number;
  activecase: string | null;
  allReady: boolean;
};

const SESSION_STORAGE_KEY = "scotland-yard-session";
const colorOptions = Object.entries(PLAYER_COLORS) as Array<
  [PlayerColor, (typeof PLAYER_COLORS)[PlayerColor]]
>;

type SavedSession = {
  roomCode: string;
  user: RoomUser;
};

function readSavedSession(code: string): SavedSession | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);

    if (stored) {
      const session = JSON.parse(stored) as SavedSession;

      if (session.roomCode === code && session.user?.id) {
        return session;
      }
    }

    return null;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function saveSession(session: SavedSession) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(
    `scotland-yard-room-${session.roomCode}`,
    JSON.stringify(session),
  );
}

function clearSession(code: string) {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(`scotland-yard-room-${code}`);
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return readSavedSession(code)?.user.id ?? null;
  });
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState<PlayerColor>("red");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRoomMissing, setIsRoomMissing] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadRoom() {
      try {
        const response = await fetch(`/api/rooms/${code}`, {
          cache: "no-store",
        });
        const data = await response.json();

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          setIsRoomMissing(true);
          setRoom(null);
          return;
        }

        setRoom(data.room);
        setIsRoomMissing(false);

        if (data.room.activecase) {
          router.replace(`/sala/${code}/jogo`);
          return;
        }

        if (data.room.allReady) {
          router.replace(`/sala/${code}/criando-caso`);
        }
      } catch {
        if (isActive) {
          setError("Não foi possível atualizar o lobby.");
        }
      }
    }

    loadRoom();
    const interval = window.setInterval(loadRoom, 2000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, router]);

  const currentUser = room?.users.find((user) => user.id === userId);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    saveSession({
      roomCode: code,
      user: currentUser,
    });
  }, [code, currentUser]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nickname, color }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível entrar na sala.");
      }

      saveSession({
        roomCode: code,
        user: data.user,
      });
      setUserId(data.user.id);
      setRoom(data.room);
      setNickname(data.user.nickname);
      setColor(data.user.color);
      setIsEditing(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível entrar na sala.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(
        `/api/rooms/${code}/users/${currentUser.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ nickname, color }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível atualizar usuário.");
      }

      saveSession({
        roomCode: code,
        user: data.user,
      });
      setRoom(data.room);
      setNickname(data.user.nickname);
      setColor(data.user.color);
      setIsEditing(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível atualizar usuário.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleReady(ready: boolean) {
    if (!currentUser) {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(`/api/rooms/${code}/ready`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: currentUser.id, ready }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível alterar pronto.");
      }

      setRoom(data.room);

      if (data.room.allReady) {
        router.push(`/sala/${code}/criando-caso`);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível alterar pronto.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function leave() {
    if (!currentUser) {
      return;
    }

    setError("");

    try {
      const response = await fetch(`/api/rooms/${code}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível sair da sala.");
      }

      clearSession(code);
      setUserId(null);
      setRoom(data.room);
      setIsEditing(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível sair da sala.",
      );
    }
  }

  if (isRoomMissing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 text-zinc-950">
        <section className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-bold">Sala não encontrada</h1>
          <p className="mt-3 text-zinc-600">
            Confira o código ou crie uma nova sala.
          </p>
          <Link
            className="mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-zinc-950 px-6 font-semibold text-white"
            href="/"
          >
            Voltar
          </Link>
        </section>
      </main>
    );
  }

  const showProfileForm = !currentUser || isEditing;
  const usedColors = new Set(
    room?.users
      .filter((user) => user.id !== currentUser?.id)
      .map((user) => user.color),
  );
  const readyCount = room?.users.filter((user) => user.ready).length ?? 0;

  return (
    <main className="sy-theme min-h-screen overflow-hidden bg-[#10130f] px-6 py-8 text-stone-50">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <section className="relative mx-auto w-full max-w-6xl">
        <header className="flex flex-col justify-between gap-5 border-b border-[#d7b861]/25 pb-6 sm:flex-row sm:items-end">
          <div>
            <Link
              className="text-sm font-semibold text-[#d7b861]"
              href="/"
              onClick={(event) => {
                if (!currentUser) {
                  return;
                }

                event.preventDefault();
                setError("Saia da sala antes de voltar ao início.");
              }}
            >
              Voltar ao início
            </Link>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.28em] text-[#c8a24a]">
              Mesa de preparação
            </p>
            <h1 className="mt-2 font-serif text-5xl font-bold text-[#fff3cf]">
              Lobby da sala
            </h1>
            <p className="mt-3 max-w-2xl text-stone-300">
              Escolha um nickname e uma cor exclusiva. Quando todos estiverem
              prontos, o caso será aberto para a sala.
            </p>
          </div>
          <div className="rounded-lg border border-[#d7b861]/40 bg-[#171b16] px-6 py-4 shadow-2xl shadow-black/25">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8a24a]">
              Código
            </p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-[0.32em] text-[#fff3cf]">
              {code}
            </p>
            <p className="mt-2 text-sm text-stone-400">
              {readyCount}/{room?.userCount ?? 0} prontos
            </p>
          </div>
        </header>

        {showProfileForm ? (
          <form
            className="mt-8 grid gap-6 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-6 shadow-2xl shadow-black/25 md:grid-cols-[1fr_auto]"
            onSubmit={currentUser ? updateUser : join}
          >
            <div>
              <label
                className="text-sm font-semibold text-[#d7b861]"
                htmlFor="nickname"
              >
                Nickname
              </label>
              <input
                className="mt-2 h-13 w-full rounded-lg border border-stone-700 bg-[#0f120e] px-4 text-lg font-semibold text-[#fff3cf] outline-none transition placeholder:text-stone-600 focus:border-[#d7b861] focus:ring-4 focus:ring-[#d7b861]/20"
                id="nickname"
                maxLength={18}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="Seu nome no lobby"
                required
                value={nickname}
              />

              <div className="mt-5">
                <p className="text-sm font-semibold text-[#d7b861]">
                  Cor exclusiva
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {colorOptions.map(([key, option]) => {
                    const isUsed = usedColors.has(key);

                    return (
                      <button
                        aria-label={`Escolher ${option.name}`}
                        className={`flex h-14 min-w-32 items-center gap-3 rounded-lg border px-3 text-left transition ${
                          color === key
                            ? "border-[#fff3cf] bg-white/10"
                            : "border-stone-700 bg-[#0f120e]"
                        } ${
                          isUsed
                            ? "cursor-not-allowed opacity-35"
                            : "hover:border-[#d7b861]"
                        }`}
                        disabled={isUsed}
                        key={key}
                        onClick={() => setColor(key)}
                        title={isUsed ? "Cor já escolhida" : option.name}
                        type="button"
                      >
                        <span
                          className="h-7 w-7 rounded-full border border-white/30"
                          style={{ backgroundColor: option.hex }}
                        />
                        <span className="font-semibold text-stone-100">
                          {option.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 self-end sm:flex-row md:flex-col">
              {currentUser ? (
                <button
                  className="h-14 rounded-lg border border-stone-600 px-8 font-semibold text-stone-100 transition hover:bg-white/10"
                  onClick={() => {
                    setIsEditing(false);
                    setNickname(currentUser.nickname);
                    setColor(currentUser.color);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              ) : null}
              <button
                className="h-14 rounded-lg bg-[#d7b861] px-8 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {currentUser ? "Salvar" : "Entrar no lobby"}
              </button>
            </div>
          </form>
        ) : (
          <div
            className="mt-8 flex flex-col justify-between gap-4 rounded-lg border px-5 py-4 shadow-2xl shadow-black/20 sm:flex-row sm:items-center"
            style={{
              borderColor: `${PLAYER_COLORS[currentUser.color].hex}66`,
              background: `linear-gradient(90deg, ${PLAYER_COLORS[currentUser.color].hex}22, #171b16 45%)`,
            }}
          >
            <div className="flex items-center gap-4">
              <span
                className="h-12 w-12 rounded-full border-2 border-white/50"
                style={{ backgroundColor: PLAYER_COLORS[currentUser.color].hex }}
              />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d7b861]">
                  Sua credencial
                </p>
                <p className="text-2xl font-bold text-[#fff3cf]">
                  {currentUser.nickname}
                </p>
                <p className="text-sm text-stone-300">
                  {PLAYER_COLORS[currentUser.color].name}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="h-11 rounded-lg border border-stone-600 bg-[#0f120e] px-5 font-semibold text-stone-100 shadow-sm transition hover:border-[#d7b861]"
                onClick={() => {
                  setNickname(currentUser.nickname);
                  setColor(currentUser.color);
                  setIsEditing(true);
                }}
                type="button"
              >
                Alterar informações
              </button>
              <button
                className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] shadow-sm transition hover:bg-[#f3dfaa]"
                onClick={() => toggleReady(!currentUser.ready)}
                type="button"
              >
                {currentUser.ready ? "Cancelar pronto" : "Pronto"}
              </button>
              <button
                className="h-11 rounded-lg bg-[#8b1e1e] px-5 font-semibold text-white shadow-sm transition hover:bg-[#a32929]"
                onClick={leave}
                type="button"
              >
                Sair da sala
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-5 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
            {error}
          </p>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-3xl font-bold text-[#fff3cf]">
              Jogadores na mesa
            </h2>
            <span className="rounded-full border border-[#d7b861]/40 bg-[#171b16] px-3 py-1 text-sm font-semibold text-[#d7b861]">
              {room?.userCount ?? 0}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {room?.users.map((user) => (
              <article
                className="relative overflow-hidden rounded-lg border bg-[#171b16] p-5 shadow-2xl shadow-black/20"
                key={user.id}
                style={{
                  borderColor: `${PLAYER_COLORS[user.color].hex}66`,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-2"
                  style={{ backgroundColor: PLAYER_COLORS[user.color].hex }}
                />
                <div className="flex items-start justify-between gap-4 pt-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7b861]">
                      {PLAYER_COLORS[user.color].name}
                      {user.id === userId ? " / Você" : ""}
                    </p>
                    <h3 className="mt-2 truncate text-3xl font-black text-[#fff3cf]">
                      {user.nickname}
                    </h3>
                  </div>
                  <span
                    className="h-14 w-14 shrink-0 rounded-full border-2 border-white/40 shadow-lg"
                    style={{ backgroundColor: PLAYER_COLORS[user.color].hex }}
                  />
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-stone-700 pt-4">
                  <span className="text-sm text-stone-400">Status</span>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${
                      user.ready
                        ? "bg-[#d7b861] text-[#17130d]"
                        : "bg-stone-800 text-stone-300"
                    }`}
                  >
                    {user.ready ? "Pronto" : "Aguardando"}
                  </span>
                </div>
              </article>
            ))}

            {room && room.users.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-600 bg-[#171b16] p-6 text-stone-400">
                Ainda não há usuários no lobby.
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
