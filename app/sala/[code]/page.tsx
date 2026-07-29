"use client";

import { FormEvent, useEffect, useRef, useState, type CSSProperties } from "react";
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

type RoomConfig = {
  readingTimeSeconds: number;
  clueSelectionTimeSeconds: number;
  revealedClueAnalysisTimeSeconds: number;
  roundAnalysisTimeSeconds: number;
  finalGuessTimeSeconds: number;
  trueCluesPerPlayer: number;
  cluesPerPlayer: number;
};

type Room = {
  code: string;
  users: RoomUser[];
  userCount: number;
  activecase: string | null;
  allReady: boolean;
  config: RoomConfig;
};

const SESSION_STORAGE_KEY = "contrapista-session";
const CASE_CREATION_NOTICE_KEY = "contrapista-case-creation-notice";

function leftCaseStorageKey(code: string) {
  return `contrapista-left-case-${code}`;
}
const colorOptions = Object.entries(PLAYER_COLORS) as Array<
  [PlayerColor, (typeof PLAYER_COLORS)[PlayerColor]]
>;

const DEFAULT_ROOM_CONFIG: RoomConfig = {
  readingTimeSeconds: 120,
  clueSelectionTimeSeconds: 10,
  revealedClueAnalysisTimeSeconds: 30,
  roundAnalysisTimeSeconds: 60,
  finalGuessTimeSeconds: 30,
  trueCluesPerPlayer: 3,
  cluesPerPlayer: 6,
};

const ROOM_CONFIG_PRESETS = [
  {
    name: "Jogo Clássico",
    config: DEFAULT_ROOM_CONFIG,
  },
  {
    name: "Jogo Sério",
    config: {
      ...DEFAULT_ROOM_CONFIG,
      readingTimeSeconds: 60,
      roundAnalysisTimeSeconds: 10,
      trueCluesPerPlayer: 1,
      cluesPerPlayer: 3,
    },
  },
] satisfies Array<{ name: string; config: RoomConfig }>;

const configFields = [
  {
    key: "readingTimeSeconds",
    label: "Leitura inicial",
    description: "Tempo reservado para ler o caso e os próprios fragmentos.",
    group: "ritmo",
    suffix: "s",
    min: 0,
    max: 300,
    step: 10,
  },
  {
    key: "clueSelectionTimeSeconds",
    label: "Escolha da pista",
    description: "Pressão aplicada ao jogador da vez para revelar um fragmento.",
    group: "ritmo",
    suffix: "s",
    min: 5,
    max: 60,
    step: 5,
  },
  {
    key: "revealedClueAnalysisTimeSeconds",
    label: "Análise da pista revelada",
    description: "Janela coletiva para discutir uma pista compartilhada.",
    group: "ritmo",
    suffix: "s",
    min: 10,
    max: 120,
    step: 5,
  },
  {
    key: "roundAnalysisTimeSeconds",
    label: "Intervalo entre rodadas",
    description: "Pausa para organizar hipóteses antes da próxima sequência.",
    group: "ritmo",
    suffix: "s",
    min: 0,
    max: 180,
    step: 10,
  },
  {
    key: "finalGuessTimeSeconds",
    label: "Escrita da resposta final",
    description: "Tempo para registrar o palpite quando alguém decide responder.",
    group: "ritmo",
    suffix: "s",
    min: 20,
    max: 180,
    step: 5,
  },
  {
    key: "cluesPerPlayer",
    label: "Pistas por jogador",
    description: "Quantidade de fragmentos recebidos por cada participante.",
    group: "dossie",
    suffix: "",
    min: 2,
    max: 10,
    step: 1,
  },
  {
    key: "trueCluesPerPlayer",
    label: "Pistas verdadeiras por jogador",
    description: "Controle a proporção entre evidência confiável e ruído narrativo.",
    group: "dossie",
    suffix: "",
    min: 0,
    max: 6,
    step: 1,
  },
] satisfies Array<{
  key: keyof RoomConfig;
  label: string;
  description: string;
  group: "ritmo" | "dossie";
  suffix: string;
  min: number;
  max: number;
  step: number;
}>;

const configGroups = [
  {
    id: "ritmo",
    title: "Ritmo da sessão",
    description: "Tempos de leitura, escolha, discussão e resposta.",
  },
  {
    id: "dossie",
    title: "Estrutura do dossiê",
    description: "Volume de pistas e proporção de informações verdadeiras.",
  },
] satisfies Array<{
  id: "ritmo" | "dossie";
  title: string;
  description: string;
}>;

function configsMatch(left: RoomConfig, right: RoomConfig) {
  return configFields.every((field) => left[field.key] === right[field.key]);
}

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
    `contrapista-room-${session.roomCode}`,
    JSON.stringify(session),
  );
}

function clearSession(code: string) {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(`contrapista-room-${code}`);
}

async function readRoomResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {} as { room?: Room; error?: string };
  }

  try {
    return JSON.parse(text) as { room?: Room; error?: string };
  } catch {
    return {
      error: `O servidor retornou uma resposta inesperada: ${text.slice(0, 180)}`,
    };
  }
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
  const [notice] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const storedNotice = sessionStorage.getItem(CASE_CREATION_NOTICE_KEY);

    if (storedNotice) {
      sessionStorage.removeItem(CASE_CREATION_NOTICE_KEY);
    }

    return storedNotice ?? "";
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isRoomMissing, setIsRoomMissing] = useState(false);
  const [configDraft, setConfigDraft] = useState<RoomConfig>(DEFAULT_ROOM_CONFIG);
  const [isConfigDirty, setIsConfigDirty] = useState(false);
  const isConfigDirtyRef = useRef(false);

  useEffect(() => {
    let isActive = true;

    async function loadRoom() {
      try {
        const response = await fetch(`/api/rooms/${code}`, {
          cache: "no-store",
        });
        const data = await readRoomResponse(response);

        if (!isActive) {
          return;
        }

        if (response.status === 404) {
          setIsRoomMissing(true);
          setRoom(null);
          return;
        }

        if (!response.ok || !data.room) {
          throw new Error(data.error ?? "Não foi possível atualizar a ante-sala.");
        }

        setRoom(data.room);

        if (!isConfigDirtyRef.current) {
          setConfigDraft(data.room.config ?? DEFAULT_ROOM_CONFIG);
        }

        setIsRoomMissing(false);

        const leftCaseId = localStorage.getItem(leftCaseStorageKey(code));

        if (!data.room.activecase && leftCaseId) {
          localStorage.removeItem(leftCaseStorageKey(code));
        }

        if (data.room.activecase && data.room.activecase !== leftCaseId) {
          router.replace(`/sala/${code}/jogo`);
          return;
        }

        if (!data.room.activecase && data.room.allReady) {
          router.replace(`/sala/${code}/criando-caso`);
        }
      } catch (caughtError) {
        if (isActive) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Não foi possível atualizar a ante-sala.",
          );
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
  const canEditConfig = Boolean(
    currentUser && room?.users[0]?.id === currentUser.id && !room.activecase,
  );

  useEffect(() => {
    if (canEditConfig || !isConfigDirtyRef.current) {
      return;
    }

    isConfigDirtyRef.current = false;
    setIsConfigDirty(false);
    setConfigDraft(room?.config ?? DEFAULT_ROOM_CONFIG);
  }, [canEditConfig, room?.config]);

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
      isConfigDirtyRef.current = false;
      setIsConfigDirty(false);
      setConfigDraft(data.room.config ?? DEFAULT_ROOM_CONFIG);
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
      isConfigDirtyRef.current = false;
      setIsConfigDirty(false);
      setConfigDraft(data.room.config ?? DEFAULT_ROOM_CONFIG);
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

  function updateConfigDraft(key: keyof RoomConfig, value: string) {
    const field = configFields.find((item) => item.key === key);
    const numericValue = Number(value);

    if (!field || !Number.isFinite(numericValue)) {
      return;
    }

    isConfigDirtyRef.current = true;
    setIsConfigDirty(true);

    setConfigDraft((current) => {
      const max = key === "trueCluesPerPlayer" ? current.cluesPerPlayer : field.max;
      const nextValue = Math.min(max, Math.max(field.min, Math.round(numericValue)));
      const next = {
        ...current,
        [key]: nextValue,
      };

      if (key === "cluesPerPlayer") {
        next.trueCluesPerPlayer = Math.min(next.trueCluesPerPlayer, nextValue);
      }

      return next;
    });
  }

  function applyConfigPreset(config: RoomConfig) {
    if (!canEditConfig || isSaving) {
      return;
    }

    isConfigDirtyRef.current = true;
    setIsConfigDirty(true);
    setConfigDraft(config);
  }

  function cancelConfigChanges() {
    isConfigDirtyRef.current = false;
    setIsConfigDirty(false);
    setConfigDraft(room?.config ?? DEFAULT_ROOM_CONFIG);
  }

  async function saveRoomConfig() {
    if (!currentUser || !canEditConfig) {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const response = await fetch(`/api/rooms/${code}/config`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: currentUser.id, config: configDraft }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível salvar a configuração.");
      }

      setRoom(data.room);
      isConfigDirtyRef.current = false;
      setIsConfigDirty(false);
      setConfigDraft(data.room.config ?? DEFAULT_ROOM_CONFIG);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível salvar a configuração.",
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

      if (!isConfigDirtyRef.current) {
        setConfigDraft(data.room.config ?? DEFAULT_ROOM_CONFIG);
      }

      if (!data.room.activecase && data.room.allReady) {
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
      isConfigDirtyRef.current = false;
      setIsConfigDirty(false);
      setConfigDraft(data.room.config ?? DEFAULT_ROOM_CONFIG);
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
      <main className="sy-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-[#10130f] px-6 py-10 text-stone-50">
        <div className="absolute inset-0 opacity-20">
          <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
        </div>
        <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#8b1e1e]/35 to-transparent" />

        <section className="relative w-full max-w-xl rounded-lg border border-[#d7b861]/35 bg-[#171b16] p-8 text-center shadow-2xl shadow-black/30">
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#d7b861]">
            Sala {code}
          </p>
          <h1 className="mt-4 font-serif text-5xl font-bold text-[#fff3cf]">
            Sala não encontrada
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-7 text-stone-300">
            O código informado não está ativo ou a sala já foi encerrada.
            Confira o código ou volte ao início para criar uma nova sala.
          </p>
          <Link
            className="mt-7 inline-flex h-12 items-center justify-center rounded-lg bg-[#d7b861] px-6 font-bold text-[#17130d] transition hover:bg-[#f3dfaa]"
            href="/"
          >
            Voltar ao início
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
    <main className="sy-theme min-h-screen overflow-hidden bg-[#10130f] px-4 py-6 text-stone-50 sm:px-6 sm:py-8 lg:px-8">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <section className="relative mx-auto w-full max-w-7xl">
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
                setError("Encerre sua participação antes de voltar ao início.");
              }}
            >
              Voltar ao início
            </Link>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.28em] text-[#c8a24a]">
              Sala reservada
            </p>
            <h1 className="mt-2 font-serif text-4xl font-bold text-[#fff3cf] sm:text-5xl">
              Ante-sala do caso
            </h1>
            <p className="mt-3 max-w-2xl text-stone-300">
              Defina sua identificação e uma cor exclusiva. Quando todos confirmarem
              prontidão, o dossiê será aberto para a sessão.
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
            className="mt-6 grid gap-5 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-5 shadow-2xl shadow-black lg:p-6/25 md:grid-cols-[1fr_auto]"
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
                placeholder="Identificação na sessão"
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
                {currentUser ? "Salvar" : "Entrar na sessão"}
              </button>
            </div>
          </form>
        ) : (
          <div
            className="current-player-card mt-6 flex flex-col justify-between gap-4 rounded-lg border px-5 py-4 shadow-2xl shadow-black/20 sm:flex-row sm:items-center"
            style={{
              borderColor: `${PLAYER_COLORS[currentUser.color].hex}66`,
              "--player-color": PLAYER_COLORS[currentUser.color].hex,
            } as CSSProperties}
          >
            <div className="flex items-center gap-4">
              <span
                className="h-12 w-12 rounded-full border-2 border-white/50"
                style={{ backgroundColor: PLAYER_COLORS[currentUser.color].hex }}
              />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d7b861]">
                  Sua identificação
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
                Editar identificação
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

        {notice ? (
          <p className="mt-5 rounded-lg border border-[#d7b861]/35 bg-[#2d2818]/80 px-4 py-3 text-sm font-medium text-[#fff3cf]">
            {notice}
          </p>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-3xl font-bold text-[#fff3cf]">
              Participantes na mesa
            </h2>
            <span className="rounded-full border border-[#d7b861]/40 bg-[#171b16] px-3 py-1 text-sm font-semibold text-[#d7b861]">
              {room?.userCount ?? 0}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {room?.users.map((user, index) => (
              <article
                className="player-card relative overflow-hidden rounded-lg border bg-[#171b16] p-5 shadow-2xl shadow-black/20"
                key={user.id}
                style={{
                  borderColor: `${PLAYER_COLORS[user.color].hex}66`,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-2"
                  style={{ backgroundColor: PLAYER_COLORS[user.color].hex }}
                />
                {index === 0 ? (
                  <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#d7b861]/60 bg-[#0f120e] text-lg text-[#d7b861] shadow-lg" title="Líder da investigação">
                    ♛
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-4 pt-3">
                  <div className="min-w-0 pr-12">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7b861]">
                      {PLAYER_COLORS[user.color].name}
                      {user.id === userId ? " / Você" : ""}
                      {index === 0 ? " / Líder" : ""}
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
                Ainda não há participantes na sessão.
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-7 overflow-hidden rounded-lg border border-[#d7b861]/30 bg-[#171b16] shadow-2xl shadow-black/25">
          <div className="border-b border-[#d7b861]/20 bg-[#0f120e] px-6 py-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
                  Comando da mesa
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                  Parâmetros do dossiê
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                  Ajuste o ritmo da mesa com controles rápidos e valores exatos.
                  As mudanças só entram em vigor depois de salvar.
                </p>
              </div>
              <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                canEditConfig
                  ? isConfigDirty
                    ? "border-[#d7b861]/50 bg-[#2a2112] text-[#fff3cf]"
                    : "border-emerald-500/30 bg-emerald-950/30 text-emerald-100"
                  : "border-stone-700 bg-[#171b16] text-stone-300"
              }`}>
                {canEditConfig
                  ? isConfigDirty
                    ? "Alterações pendentes"
                    : "Liderança sob seu controle"
                  : "Edição restrita ao primeiro participante"}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-[#d7b861]/20 bg-[#171b16] p-3 text-sm font-semibold text-stone-300">
              <span className="rounded-full bg-[#0f120e] px-3 py-1">
                {configDraft.trueCluesPerPlayer}/{configDraft.cluesPerPlayer} pistas verdadeiras
              </span>
              <span className="rounded-full bg-[#0f120e] px-3 py-1">
                Leitura {configDraft.readingTimeSeconds}s
              </span>
              <span className="rounded-full bg-[#0f120e] px-3 py-1">
                Palpite {configDraft.finalGuessTimeSeconds}s
              </span>
            </div>
          </div>

          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {ROOM_CONFIG_PRESETS.map((preset) => {
                const isActivePreset = configsMatch(configDraft, preset.config);

                return (
                  <button
                    className={`rounded-lg border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isActivePreset
                        ? "border-[#d7b861] bg-[#d7b861] text-[#17130d] shadow-lg shadow-[#d7b861]/20"
                        : "border-[#d7b861]/25 bg-[#0f120e] hover:border-[#d7b861] hover:bg-[#171b16]"
                    }`}
                    disabled={!canEditConfig || isSaving}
                    key={preset.name}
                    onClick={() => applyConfigPreset(preset.config)}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-serif text-xl font-bold">
                        {preset.name}
                      </span>
                      {isActivePreset ? (
                        <span className="rounded-full bg-[#17130d]/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em]">
                          Ativo
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block text-sm leading-5 opacity-80">
                      {preset.config.cluesPerPlayer} pistas, {preset.config.trueCluesPerPlayer} verdadeira(s), leitura de {preset.config.readingTimeSeconds}s.
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 space-y-5">
              {configGroups.map((group) => (
                <div
                  className="rounded-lg border border-[#d7b861]/25 bg-[#0f120e] p-4"
                  key={group.id}
                >
                  <div className="flex flex-col justify-between gap-2 border-b border-[#d7b861]/15 pb-4 md:flex-row md:items-end">
                    <div>
                      <h3 className="font-serif text-2xl font-bold text-[#fff3cf]">
                        {group.title}
                      </h3>
                      <p className="mt-1 text-sm text-stone-400">
                        {group.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {configFields
                      .filter((field) => field.group === group.id)
                      .map((field) => {
                        const max = field.key === "trueCluesPerPlayer" ? configDraft.cluesPerPlayer : field.max;
                        const value = configDraft[field.key];

                        return (
                          <div
                            className="rounded-lg border border-stone-700 bg-[#171b16] p-4"
                            key={field.key}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <span className="text-sm font-bold text-[#d7b861]">
                                  {field.label}
                                </span>
                                <p className="mt-1 text-xs leading-5 text-stone-400">
                                  {field.description}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full border border-[#d7b861]/25 bg-[#0f120e] px-3 py-1 text-xs font-bold text-stone-400">
                                {field.min}-{max}{field.suffix}
                              </span>
                            </div>

                            <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                              <button
                                aria-label={`Diminuir ${field.label}`}
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-700 bg-[#0f120e] text-lg font-black text-stone-100 transition hover:border-[#d7b861] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canEditConfig || isSaving || value <= field.min}
                                onClick={() => updateConfigDraft(field.key, String(value - field.step))}
                                type="button"
                              >
                                -
                              </button>
                              <input
                                aria-label={field.label}
                                className="w-full accent-[#d7b861] disabled:opacity-60"
                                disabled={!canEditConfig || isSaving}
                                max={max}
                                min={field.min}
                                onChange={(event) =>
                                  updateConfigDraft(field.key, event.target.value)
                                }
                                step={field.step}
                                type="range"
                                value={value}
                              />
                              <button
                                aria-label={`Aumentar ${field.label}`}
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-700 bg-[#0f120e] text-lg font-black text-stone-100 transition hover:border-[#d7b861] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canEditConfig || isSaving || value >= max}
                                onClick={() => updateConfigDraft(field.key, String(value + field.step))}
                                type="button"
                              >
                                +
                              </button>
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-3">
                              <label className="text-xs font-semibold text-stone-500" htmlFor={`config-${field.key}`}>
                                Valor exato
                              </label>
                              <div className="flex items-center gap-2">
                                <input
                                  aria-label={`Valor exato de ${field.label}`}
                                  className="h-10 w-24 rounded-lg border border-stone-700 bg-[#0f120e] px-3 text-center font-bold text-[#fff3cf] outline-none transition focus:border-[#d7b861] focus:ring-4 focus:ring-[#d7b861]/20 disabled:opacity-60"
                                  disabled={!canEditConfig || isSaving}
                                  id={`config-${field.key}`}
                                  max={max}
                                  min={field.min}
                                  onChange={(event) =>
                                    updateConfigDraft(field.key, event.target.value)
                                  }
                                  step={field.step}
                                  type="number"
                                  value={value}
                                />
                                {field.suffix ? (
                                  <span className="w-5 text-sm font-bold text-stone-400">
                                    {field.suffix}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            {canEditConfig ? (
              <div className="sticky bottom-4 z-10 mt-6 flex flex-col gap-3 rounded-lg border border-[#d7b861]/30 bg-[#10130f]/95 p-3 shadow-2xl shadow-black/30 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-stone-300">
                  {isConfigDirty
                    ? "Revise e salve para atualizar a ante-sala."
                    : "Sem alterações pendentes."}
                </p>
                <div className="flex flex-wrap justify-end gap-3">
                  {isConfigDirty ? (
                    <button
                      className="h-11 rounded-lg border border-stone-600 bg-[#0f120e] px-5 font-semibold text-stone-100 transition hover:border-[#d7b861] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSaving}
                      onClick={cancelConfigChanges}
                      type="button"
                    >
                      Cancelar
                    </button>
                  ) : null}
                  <button
                    className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isSaving || !isConfigDirty}
                    onClick={saveRoomConfig}
                    type="button"
                  >
                    {isSaving ? "Salvando" : "Salvar configuração"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

      </section>
    </main>
  );
}
