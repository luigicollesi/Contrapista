"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SESSION_STORAGE_KEY = "contrapista-session";
const BROWSER_ID_STORAGE_KEY = "contrapista-browser-id";

type SavedSession = {
  roomCode: string;
  user: {
    id: string;
    browserId: string;
    nickname: string | null;
    color?: string | null;
  };
};

const manualHighlights = [
  {
    title: "Mesa de investigação",
    items: [
      "O caso chega como um dossiê incompleto, cheio de indícios e lacunas.",
      "A mesa precisa discutir, comparar versões e separar evidência de distração.",
      "Vence a tese que responde ao caso com clareza, não a frase mais longa.",
    ],
  },
  {
    title: "Pistas em disputa",
    items: [
      "Cada jogador segura fragmentos que podem confirmar ou desviar a investigação.",
      "Nenhuma pista vem com selo de confiança; o valor dela nasce no debate.",
      "Quem sai da disputa vira observador privilegiado do arquivo completo.",
    ],
  },
  {
    title: "Pressão de rodada",
    items: [
      "A partida alterna leitura, revelação, análise e silêncio estratégico.",
      "O grupo pode preferir uma sessão lenta e meticulosa ou uma mesa mais severa.",
      "Quando o tempo aperta, a intuição pesa tanto quanto a dedução.",
    ],
  },
];

const manualFlow = [
  {
    step: "01",
    title: "Reúna a mesa",
    body: "Entre na sala, assuma um nome e escolha uma cor. Quando todos estiverem prontos, o dossiê pode ser aberto.",
  },
  {
    step: "02",
    title: "Defina o tom da investigação",
    body: "Antes do caso começar, a mesa decide se quer uma apuração paciente, uma sessão tensa ou um confronto mais direto.",
  },
  {
    step: "03",
    title: "Leia sem revelar demais",
    body: "Cada investigador examina o cenário e seus próprios fragmentos. É hora de notar contradições e escolher o que guardar.",
  },
  {
    step: "04",
    title: "Deixe a ordem decidir",
    body: "A roleta estabelece quem fala primeiro. A partir daí, cada voz entra no caso em seu momento.",
  },
  {
    step: "05",
    title: "Abra um fragmento",
    body: "Na sua vez, revele uma pista. Ela pode iluminar o caminho, reforçar uma suspeita ou arrastar a mesa para uma falsa certeza.",
  },
  {
    step: "06",
    title: "Sustente uma tese",
    body: "Depois das rodadas de análise, qualquer jogador pode assumir o risco de responder. Um acerto encerra o caso; um erro muda a mesa.",
  },
];

const manualDetails = [
  "Todos podem acelerar uma fase quando a mesa já tem o que precisa.",
  "Errar a solução tira o jogador da disputa, mas abre seu arquivo para os demais.",
  "Um palpite final suspende a mesa: naquele momento, todos aguardam a tese ser registrada.",
  "A conclusão permanece disponível para cada jogador até ele decidir voltar à ante-sala.",
  "A sala guarda sua presença no navegador, sem exigir cadastro ou conta.",
];

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

function saveSession(session: SavedSession) {
  localStorage.setItem(BROWSER_ID_STORAGE_KEY, session.user.browserId);
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(
    `contrapista-room-${session.roomCode}`,
    JSON.stringify(session),
  );
}

function getBrowserId() {
  let browserId = localStorage.getItem(BROWSER_ID_STORAGE_KEY);

  if (!browserId) {
    browserId = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_STORAGE_KEY, browserId);
  }

  return browserId;
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ browserId: getBrowserId() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível criar a sala.");
      }

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
      const response = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ browserId: getBrowserId() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Sala não encontrada.");
      }

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
    <main className="sy-theme home-page min-h-screen overflow-hidden bg-[#0e1111] text-stone-50">
      <div className="absolute inset-0 opacity-[0.18]">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-[#7c1f2a]/30 via-[#1e2626]/20 to-transparent" />
      <div className="home-shell relative mx-auto flex w-full max-w-7xl flex-col px-4 pb-10 pt-3 sm:px-6 sm:pb-12 sm:pt-4 lg:px-8 lg:pb-14 lg:pt-5">
        <header className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="brand-mark flex h-12 w-12 items-center justify-center overflow-hidden rounded-sm border border-[#d0a85c]/50 bg-[#171a1a] shadow-lg">
              <img
                alt="Contrapista"
                className="h-10 w-10 object-contain"
                src="/contrapista-icon.png"
              />
            </div>
            <div>
              <p className="font-serif text-2xl font-bold tracking-wide text-[#f5e7bd]">
                Contrapista
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b98d47]">
                Jogo online de investigação
              </p>
            </div>
          </div>
        </header>

        <section className="home-hero grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,.95fr)] lg:gap-14">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#d0a85c]">
              Jogo online de investigação
            </p>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl font-bold leading-[0.98] text-[#f2e6c8] sm:text-7xl lg:text-8xl">
              Contrapista
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 sm:text-xl text-stone-200">
              Uma sala reservada, versões em conflito e evidências que não
              aceitam narrativa fácil. Conduza a sessão, sustente hipóteses e
              exponha a contradição que fecha o caso.
            </p>

            <div className="mt-8 grid max-w-3xl sm:mt-10 gap-4 sm:grid-cols-2">
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
                  Gera um código de acesso e abre uma sala privada para o
                  grupo preparar a sessão sem cadastro ou exposição pública.
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
          </div>

          <div className="relative hidden min-h-[520px] lg:block">
            <div className="absolute left-10 top-4 h-72 w-56 rotate-[-8deg] rounded-sm border border-[#d0a85c]/40 bg-[#e9d3a0] p-5 text-[#21170f] shadow-2xl">
              <p className="border-b border-[#6f5533]/30 pb-3 font-serif text-2xl font-bold">
                Dossiê
              </p>
              <div className="mt-5 space-y-3">
                <span className="block h-3 w-36 rounded-full bg-[#6f5533]/50" />
                <span className="block h-3 w-44 rounded-full bg-[#6f5533]/35" />
                <span className="block h-3 w-28 rounded-full bg-[#6f5533]/35" />
              </div>
              <div className="mt-8 rounded border border-[#8b1e1e]/30 px-3 py-2 text-center font-mono text-xl font-bold tracking-[0.28em] text-[#7c1f2a]">
                ARQUIVO
              </div>
            </div>
            <div className="absolute right-2 top-24 h-80 w-72 rotate-6 rounded-sm border border-stone-600 bg-[#202323] p-5 shadow-2xl">
              <div className="grid h-full grid-cols-3 grid-rows-4 gap-3">
                {Array.from({ length: 12 }).map((_, index) => (
                  <span
                    className="rounded border border-[#d0a85c]/20 bg-[#0e1111]"
                    key={index}
                  />
                ))}
              </div>
            </div>
            <div className="absolute bottom-0 left-24 h-52 w-80 rotate-[-2deg] rounded-sm border border-[#b98d47]/40 bg-[#151818] p-6 shadow-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#b98d47]">
                Quadro de evidências
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="h-20 rounded border border-stone-600 bg-stone-900" />
                <div className="h-20 rounded border border-stone-600 bg-stone-900" />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14 border-t border-[#d0a85c]/25 pt-8 sm:mt-16 sm:pt-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(280px,.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-12">
            <div className="lg:sticky lg:top-8">
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-[#d0a85c]">
                Manual de campo
              </p>
              <h2 className="mt-4 font-serif text-4xl font-bold text-[#f2e6c8] sm:text-5xl">
                Como conduzir uma sessão
              </h2>
              <p className="mt-4 text-lg leading-8 text-stone-300">
                Contrapista coloca a mesa diante de um caso incompleto.
                Cada investigador tem peças do arquivo, mas ninguém sabe de
                imediato quais delas sustentam a verdade.
              </p>
              <div className="mt-6 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-5 shadow-xl shadow-black/20">
                <h3 className="font-serif text-2xl font-bold text-[#f2e6c8]">
                  Objetivo
                </h3>
                <p className="mt-3 text-sm leading-7 text-stone-300">
                  Construa uma resposta convincente para o caso antes que
                  pistas falsas, conclusões apressadas e apostas ruins tomem conta da mesa.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <div className="flex items-end justify-between gap-4 border-b border-[#d0a85c]/20 pb-3">
                  <h3 className="font-serif text-3xl font-bold text-[#f2e6c8]">
                    Características principais
                  </h3>
                  <span className="font-mono text-sm font-bold text-[#b98d47]">
                    Visão geral
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {manualHighlights.map((section) => (
                    <article
                      className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-5 shadow-xl shadow-black/20"
                      key={section.title}
                    >
                      <h4 className="font-serif text-xl font-bold leading-tight text-[#f2e6c8]">
                        {section.title}
                      </h4>
                      <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
                        {section.items.map((item) => (
                          <li className="border-l border-[#d0a85c]/35 pl-3" key={item}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-end justify-between gap-4 border-b border-[#d0a85c]/20 pb-3">
                  <h3 className="font-serif text-3xl font-bold text-[#f2e6c8]">
                    Fluxo de partida
                  </h3>
                  <span className="font-mono text-sm font-bold text-[#b98d47]">
                    Passo a passo
                  </span>
                </div>
                <div className="mt-4 grid gap-3">
                  {manualFlow.map((step) => (
                    <article
                      className="grid gap-4 rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-4 shadow-xl shadow-black/20 sm:grid-cols-[4rem_1fr]"
                      key={step.step}
                    >
                      <span className="font-mono text-2xl font-black text-[#d0a85c]">
                        {step.step}
                      </span>
                      <div>
                        <h4 className="font-serif text-xl font-bold text-[#f2e6c8]">
                          {step.title}
                        </h4>
                        <p className="mt-2 text-sm leading-6 text-stone-300">
                          {step.body}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-sm border border-[#d0a85c]/25 bg-[#171a1a]/85 p-5 shadow-xl shadow-black/20">
                <h3 className="font-serif text-3xl font-bold text-[#f2e6c8]">
                  Detalhes importantes
                </h3>
                <ul className="mt-4 grid gap-3 text-sm leading-6 text-stone-300 md:grid-cols-2">
                  {manualDetails.map((detail) => (
                    <li className="border-l border-[#d0a85c]/35 pl-3" key={detail}>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>

      {isJoinOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6">
          <form
            className="w-full max-w-md rounded-sm border border-[#d0a85c]/40 bg-[#171a1a] p-5 text-stone-50 shadow-2xl sm:p-6"
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
              className="mt-6 h-16 w-full rounded-lg border border-[#d0a85c]/50 bg-[#0b0d0d] px-5 text-center font-mono text-3xl font-bold tracking-[0.42em] text-[#f2e6c8] outline-none transition placeholder:text-stone-600 focus:border-[#f3dfaa] focus:ring-4 focus:ring-[#d7b861]/20"
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
        </div>
      ) : null}
    </main>
  );
}
