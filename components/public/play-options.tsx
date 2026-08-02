"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-http";
import { getBrowserId, saveSession } from "@/lib/client-session";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";

type PlayModeId = "casual" | "ranked" | "custom" | "daily";

type PlayMode = {
  id: PlayModeId;
  title: string;
  eyebrow: string;
  body: string;
  facts: string[];
  action: string;
  accent: string;
  status?: string;
};

type RoomSessionResponse = {
  room: {
    code: string;
  };
  user: {
    id: string;
    browserId: string;
    nickname: string | null;
    color?: string | null;
  };
};

const modes: PlayMode[] = [
  {
    id: "casual",
    title: "Jogo casual",
    eyebrow: "4 jogadores · cada um por si",
    body: "Entre na fila e dispute para acertar a solução antes dos outros, sem mexer no seu rating.",
    facts: ["Exatamente 4 jogadores", "Sem ranking", "Fila automática"],
    action: "Buscar casual",
    accent: "#d0a85c",
  },
  {
    id: "ranked",
    title: "Jogo rankeado",
    eyebrow: "4 jogadores · rating ativo",
    body: "A mesma mesa de 4 jogadores, agora valendo rating para quem resolver primeiro.",
    facts: ["Exatamente 4 jogadores", "Impacta rating", "Histórico competitivo"],
    action: "Buscar rankeada",
    accent: "#7c1f2a",
  },
  {
    id: "custom",
    title: "Sala personalizada",
    eyebrow: "Código privado · seu grupo",
    body: "Crie uma sala para disputar com amigos ou entre pelo código de uma mesa aberta.",
    facts: ["Código de 4 números", "Configuração da sala", "Convite direto"],
    action: "Criar sala",
    accent: "#f2e6c8",
  },
  {
    id: "daily",
    title: "Problema diário",
    eyebrow: "Desafio solo · 1 caso por dia",
    body: "Resolva o caso do dia no seu tempo, sem fila e sem formar sala.",
    facts: ["Sem fila", "Caso do dia", "Conta no perfil"],
    action: "Resolver diário",
    accent: "#8fb3a2",
  },
];

export function PlayOptions() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function createCustomRoom() {
    setError("");
    setIsLoading(true);

    try {
      const data = await requestJson<RoomSessionResponse>(
        "/api/rooms",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browserId: getBrowserId() }),
        },
        "Não deu para criar a sala agora.",
      );

      saveSession({ roomCode: data.room.code, user: data.user });
      router.push(`/sala/${data.room.code}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para criar a sala agora.",
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ browserId: getBrowserId() }),
        },
        "Não encontramos essa sala.",
      );

      saveSession({ roomCode: code, user: data.user });
      router.push(`/sala/${code}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para entrar na sala.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <section className="mt-8 border-y border-[#d0a85c]/20 sm:mt-12">
        {modes.map((mode, index) => {
          const isCustom = mode.id === "custom";
          const isMatchmaking = mode.id === "casual" || mode.id === "ranked";
          const isDaily = mode.id === "daily";

          return (
            <article
              className="responsive-container grid gap-4 border-b border-[#d0a85c]/15 py-5 last:border-b-0 sm:py-7 lg:grid-cols-[110px_minmax(0,1fr)_260px] lg:items-center"
              key={mode.id}
            >
              <div className="flex items-center gap-4 lg:block">
                <span className="block font-mono text-3xl font-black text-[#d0a85c] sm:text-4xl">
                  0{index + 1}
                </span>
                <span
                  className="block h-2 w-16 rounded-full lg:mt-4"
                  style={{ backgroundColor: mode.accent }}
                />
              </div>

              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d0a85c]">
                    {mode.eyebrow}
                  </p>
                  {mode.status ? (
                    <span className="border border-[#d0a85c]/25 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">
                      {mode.status}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 font-serif text-3xl font-bold leading-tight text-[#f2e6c8] sm:mt-3 sm:text-5xl">
                  {mode.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-stone-300 sm:mt-4 sm:text-base sm:leading-7">
                  {mode.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
                  {mode.facts.map((fact) => (
                    <span
                      className="border border-[#d0a85c]/20 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-stone-400 sm:px-3 sm:py-2 sm:text-xs sm:tracking-[0.14em]"
                      key={fact}
                    >
                      {fact}
                    </span>
                  ))}
                </div>
                {isCustom && error ? (
                  <p className="mt-5 max-w-xl rounded-sm border border-red-400/30 bg-red-950/45 px-4 py-3 text-sm font-medium text-red-100">
                    {error}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-col lg:gap-3 lg:items-stretch">
                <button
                  className="inline-flex h-12 items-center justify-center rounded-sm bg-[#d0a85c] px-5 text-sm font-black uppercase tracking-[0.16em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={(!isCustom && !isMatchmaking && !isDaily) || isLoading}
                  onClick={
                    isCustom
                      ? createCustomRoom
                      : isMatchmaking
                        ? () => router.push(`/jogar/busca?mode=${mode.id}`)
                        : isDaily
                          ? () => router.push("/jogar/diario")
                        : undefined
                  }
                  type="button"
                >
                  {mode.action}
                </button>
                {isCustom ? (
                <button
                  className="inline-flex h-12 items-center justify-center rounded-sm border border-[#d0a85c]/45 px-5 text-sm font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={isLoading}
                  onClick={() => {
                    setIsJoinOpen(true);
                    setRoomCode("");
                    setError("");
                  }}
                  type="button"
                >
                  Entrar por código
                </button>
              ) : null}
            </div>
            </article>
          );
        })}
      </section>

      {isJoinOpen ? (
        <ResponsiveSheet
          backdropClassName="bg-black/70 backdrop-blur-sm"
          contentClassName="max-w-md border border-[#d0a85c]/40 bg-[#171a1a] p-5 text-stone-50 sm:w-[28rem] sm:rounded-sm sm:p-6"
          zIndexClassName="z-[80]"
        >
          <form
            className="contents"
            onSubmit={enterRoom}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d0a85c]">
                  Sala personalizada
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]">
                  Código da sala
                </h2>
              </div>
              <button
                aria-label="Fechar"
                className="flex h-9 w-9 items-center justify-center rounded-sm border border-stone-600 text-lg font-bold text-stone-200 transition hover:border-[#d0a85c]"
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
              className="mt-6 h-16 w-full rounded-sm border border-[#d0a85c]/50 bg-[#0b0d0d] px-5 text-center font-mono text-3xl font-bold tracking-[0.32em] text-[#f2e6c8] outline-none transition placeholder:text-stone-600 focus:border-[#f3dfaa] focus:ring-4 focus:ring-[#d7b861]/20 sm:tracking-[0.42em]"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) =>
                setRoomCode(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="0000"
              value={roomCode}
            />

            {error ? (
              <p className="mt-4 rounded-sm border border-red-400/30 bg-red-950/45 px-4 py-3 text-sm font-medium text-red-100">
                {error}
              </p>
            ) : null}

            <button
              className="mt-6 h-12 w-full rounded-sm bg-[#d0a85c] px-6 font-bold text-[#17130d] transition hover:bg-[#ead19a] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading}
              type="submit"
            >
              Entrar na sala
            </button>
          </form>
        </ResponsiveSheet>
      ) : null}
    </>
  );
}
