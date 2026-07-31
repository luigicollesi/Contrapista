"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { readJsonResponse, requestJson } from "@/lib/client-http";
import {
  SESSION_STORAGE_KEY,
  getBrowserId,
  readSavedSession,
  saveSession,
} from "@/lib/client-session";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";

type HomeSessionUser = {
  id: string;
  browserId: string;
  nickname: string | null;
  color?: string | null;
};

type RoomSessionResponse = {
  room: {
    code: string;
  };
  user: HomeSessionUser;
};

export function HomeRoomActions() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function restoreSession() {
      const session = readSavedSession();

      if (!session) {
        return;
      }

      try {
        const response = await fetch(`/api/rooms/${session.roomCode}`, {
          cache: "no-store",
        });
        const data = await readJsonResponse<{
          room?: { users?: Array<{ id: string }> };
        }>(response);
        const isStillInRoom = data.room?.users?.some(
          (user: { id: string }) => user.id === session.user.id,
        );

        if (!isActive) {
          return;
        }

        if (response.ok && isStillInRoom) {
          router.replace(`/sala/${session.roomCode}`);
          return;
        }

        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {
        if (isActive) {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    }

    restoreSession();

    return () => {
      isActive = false;
    };
  }, [router]);

  async function createNewRoom() {
    setError("");
    setIsLoading(true);

    try {
      const data = await requestJson<RoomSessionResponse>(
        "/api/rooms",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ browserId: getBrowserId() }),
        },
        "Não foi possível criar a sala.",
      );

      saveSession({
        roomCode: data.room.code,
        user: data.user,
      });
      router.push(`/sala/${data.room.code}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível criar a sala.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function enterRoom(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = roomCode.trim();

    if (!/^\d{4}$/.test(code)) {
      setError("Digite um código com 4 números.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const data = await requestJson<RoomSessionResponse>(
        `/api/rooms/${code}/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ browserId: getBrowserId() }),
        },
        "Sala não encontrada.",
      );

      saveSession({
        roomCode: code,
        user: data.user,
      });
      router.push(`/sala/${code}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível entrar na sala.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="mt-8 grid max-w-3xl gap-4 sm:mt-10 sm:grid-cols-2">
        <button
          className="group min-h-44 rounded-sm border border-[#d0a85c]/60 bg-[#ead19a] p-5 text-left text-[#17130d] shadow-2xl shadow-black/25 transition hover:-translate-y-1 hover:bg-[#f1d49a] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={createNewRoom}
          type="button"
        >
          <span className="block text-sm font-bold uppercase tracking-[0.2em] text-[#7c1f2a]">
            Nova sessão
          </span>
          <span className="mt-5 block font-serif text-3xl font-bold">
            Criar sala
          </span>
          <span className="mt-5 block text-base leading-7 text-[#3a3021]">
            Gera um código de acesso e abre uma sala privada para o grupo
            preparar a sessão com conta opcional e sem exposição pública.
          </span>
          <span className="mt-6 inline-flex h-10 items-center rounded-full bg-[#17130d] px-5 text-sm font-bold text-[#f3dfaa] transition group-hover:bg-[#7c1f2a]">
            Abrir dossiê
          </span>
        </button>

        <button
          className="group min-h-44 rounded-sm border border-stone-600 bg-[#171a1a] p-5 text-left shadow-2xl shadow-black/25 transition hover:-translate-y-1 hover:border-[#d0a85c] hover:bg-[#202323] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading}
          onClick={() => {
            setIsJoinOpen(true);
            setRoomCode("");
            setError("");
          }}
          type="button"
        >
          <span className="block text-sm font-bold uppercase tracking-[0.2em] text-[#d0a85c]">
            Código reservado
          </span>
          <span className="mt-5 block font-serif text-3xl font-bold text-[#f2e6c8]">
            Entrar
          </span>
          <span className="mt-5 block text-base leading-7 text-stone-300">
            Use o código recebido para acessar uma investigação já aberta.
          </span>
          <span className="mt-6 inline-flex h-10 items-center rounded-full border border-[#d0a85c]/60 px-5 text-sm font-bold text-[#f3dfaa] transition group-hover:bg-[#d0a85c] group-hover:text-[#17130d]">
            Informar código
          </span>
        </button>
      </div>

      {error && !isJoinOpen ? (
        <p className="mt-6 max-w-md rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
          {error}
        </p>
      ) : null}

      {isJoinOpen ? (
        <ResponsiveSheet
          backdropClassName="bg-black/65"
          contentClassName="max-w-md border border-[#d0a85c]/40 bg-[#171a1a] p-5 text-stone-50 sm:w-[28rem] sm:rounded-sm sm:p-6"
        >
          <form
            className="contents"
            onSubmit={enterRoom}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d0a85c]">
                  Acessar sessão
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]">
                  Código reservado
                </h2>
              </div>
              <button
                aria-label="Fechar"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-200 transition hover:bg-stone-700"
                onClick={() => {
                  setIsJoinOpen(false);
                  setError("");
                }}
                type="button"
              >
                X
              </button>
            </div>

            <input
              aria-label="Código reservado"
              autoFocus
              className="mt-6 h-16 w-full rounded-lg border border-[#d0a85c]/50 bg-[#0b0d0d] px-5 text-center font-mono text-3xl font-bold tracking-[0.32em] text-[#f2e6c8] outline-none transition placeholder:text-stone-600 focus:border-[#f3dfaa] focus:ring-4 focus:ring-[#d7b861]/20 sm:tracking-[0.42em]"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) =>
                setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="0000"
              value={roomCode}
            />

            {error ? (
              <p className="mt-4 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
                {error}
              </p>
            ) : null}

            <button
              className="mt-6 h-13 w-full rounded-lg bg-[#d0a85c] px-6 font-bold text-[#17130d] transition hover:bg-[#ead19a] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              type="submit"
            >
              Entrar no dossiê
            </button>
          </form>
        </ResponsiveSheet>
      ) : null}
    </>
  );
}
