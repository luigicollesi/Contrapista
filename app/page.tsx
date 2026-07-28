"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_STORAGE_KEY = "scotland-yard-session";

type SavedSession = {
  roomCode: string;
  user: {
    id: string;
    nickname: string;
    color: string;
  };
};

function readSavedSession() {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const session = JSON.parse(stored) as SavedSession;

    if (!/^\d{4}$/.test(session.roomCode) || !session.user?.id) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export default function Home() {
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
        const data = await response.json();
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
      const response = await fetch("/api/rooms", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível criar a sala.");
      }

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

  async function enterRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = roomCode.trim();

    if (!/^\d{4}$/.test(code)) {
      setError("Digite um código com 4 números.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/rooms/${code}`);

      if (!response.ok) {
        throw new Error("Sala não encontrada.");
      }

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
    <main className="sy-theme min-h-screen overflow-hidden bg-[#10130f] text-stone-50">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#8b1e1e]/35 to-transparent" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-8">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#c8a24a]/50 bg-[#1b1f18] font-serif text-2xl font-bold text-[#e7c46b] shadow-lg">
              SY
            </div>
            <div>
              <p className="font-serif text-2xl font-bold tracking-wide text-[#f5e7bd]">
                Scotland Yard
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8a24a]">
                Case Room
              </p>
            </div>
          </div>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-[1.02fr_.98fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#d7b861]">
              Uma mesa. Um caso. Quatorze pistas.
            </p>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-[1.02] text-[#fff3cf] sm:text-7xl">
              Reúna os detetives antes que Londres esfrie as pistas.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-300">
              Crie uma sala temporária, compartilhe o código e comece uma
              investigação cooperativa inspirada no Scotland Yard clássico.
            </p>

            <div className="mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
              <button
                className="group min-h-48 rounded-lg border border-[#d7b861]/60 bg-[#f3dfaa] p-6 text-left text-[#17130d] shadow-2xl shadow-black/25 transition hover:-translate-y-1 hover:bg-[#ffe6a6] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                onClick={createNewRoom}
                type="button"
              >
                <span className="block text-sm font-bold uppercase tracking-[0.2em] text-[#8b1e1e]">
                  Novo caso
                </span>
                <span className="mt-5 block font-serif text-3xl font-bold">
                  Criar sala
                </span>
                <span className="mt-5 block text-base leading-7 text-[#3a3021]">
                  Gera um código de 4 números e abre um lobby para os
                  jogadores.
                </span>
                <span className="mt-6 inline-flex h-10 items-center rounded-full bg-[#17130d] px-5 text-sm font-bold text-[#f3dfaa] transition group-hover:bg-[#8b1e1e]">
                  Abrir investigação
                </span>
              </button>

              <button
                className="group min-h-48 rounded-lg border border-stone-600 bg-[#171b16] p-6 text-left shadow-2xl shadow-black/25 transition hover:-translate-y-1 hover:border-[#d7b861] hover:bg-[#20251d] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                onClick={() => {
                  setIsJoinOpen(true);
                  setRoomCode("");
                  setError("");
                }}
                type="button"
              >
                <span className="block text-sm font-bold uppercase tracking-[0.2em] text-[#d7b861]">
                  Código da sala
                </span>
                <span className="mt-5 block font-serif text-3xl font-bold text-[#fff3cf]">
                  Entrar
                </span>
                <span className="mt-5 block text-base leading-7 text-stone-300">
                  Use o código recebido para se juntar ao lobby do grupo.
                </span>
                <span className="mt-6 inline-flex h-10 items-center rounded-full border border-[#d7b861]/60 px-5 text-sm font-bold text-[#f3dfaa] transition group-hover:bg-[#d7b861] group-hover:text-[#17130d]">
                  Inserir código
                </span>
              </button>
            </div>

            {error && !isJoinOpen ? (
              <p className="mt-6 max-w-md rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
                {error}
              </p>
            ) : null}
          </div>

          <div className="relative hidden min-h-[520px] lg:block">
            <div className="absolute left-10 top-4 h-72 w-56 rotate-[-8deg] rounded-lg border border-[#d7b861]/40 bg-[#e9d3a0] p-5 text-[#21170f] shadow-2xl">
              <p className="border-b border-[#6f5533]/30 pb-3 font-serif text-2xl font-bold">
                Relatório
              </p>
              <div className="mt-5 space-y-3">
                <span className="block h-3 w-36 rounded-full bg-[#6f5533]/50" />
                <span className="block h-3 w-44 rounded-full bg-[#6f5533]/35" />
                <span className="block h-3 w-28 rounded-full bg-[#6f5533]/35" />
              </div>
              <div className="mt-8 rounded border border-[#8b1e1e]/30 px-3 py-2 text-center font-mono text-xl font-bold tracking-[0.28em] text-[#8b1e1e]">
                14 PISTAS
              </div>
            </div>
            <div className="absolute right-2 top-24 h-80 w-72 rotate-6 rounded-lg border border-stone-600 bg-[#20251d] p-5 shadow-2xl">
              <div className="grid h-full grid-cols-3 grid-rows-4 gap-3">
                {Array.from({ length: 12 }).map((_, index) => (
                  <span
                    className="rounded border border-[#d7b861]/20 bg-[#10130f]"
                    key={index}
                  />
                ))}
              </div>
            </div>
            <div className="absolute bottom-0 left-24 h-52 w-80 rotate-[-2deg] rounded-lg border border-[#c8a24a]/40 bg-[#141813] p-6 shadow-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#c8a24a]">
                Evidence Board
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="h-20 rounded border border-stone-600 bg-stone-900" />
                <div className="h-20 rounded border border-stone-600 bg-stone-900" />
              </div>
            </div>
          </div>
        </section>
      </div>

      {isJoinOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <form
            className="w-full max-w-md rounded-lg border border-[#d7b861]/40 bg-[#171b16] p-6 text-stone-50 shadow-2xl"
            onSubmit={enterRoom}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">
                  Entrar na sala
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                  Código do caso
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
              aria-label="Código da sala"
              autoFocus
              className="mt-6 h-16 w-full rounded-lg border border-[#d7b861]/50 bg-[#0f120e] px-5 text-center font-mono text-3xl font-bold tracking-[0.42em] text-[#fff3cf] outline-none transition placeholder:text-stone-600 focus:border-[#f3dfaa] focus:ring-4 focus:ring-[#d7b861]/20"
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
              className="mt-6 h-13 w-full rounded-lg bg-[#d7b861] px-6 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              type="submit"
            >
              Entrar na investigação
            </button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
