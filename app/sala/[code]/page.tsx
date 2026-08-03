"use client";

import { useEffect, useRef, useState, type CSSProperties, type SubmitEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FriendNetworkPanel } from "@/components/public/friend-network-panel";
import { LeaveRoomButton } from "@/components/rooms/leave-room-button";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";
import { readJsonResponse, requestJson, withCsrfHeader } from "@/lib/client-http";
import {
  clearSession,
  getBrowserId,
  leftCaseStorageKey,
  readSavedSession,
  saveSession,
} from "@/lib/client-session";
import {
  PLAYER_COLORS,
  type PlayerColor,
} from "@/lib/player-colors";

type RoomUser = {
  accountUserId?: string | null;
  id: string;
  browserId: string;
  nickname: string | null;
  color: PlayerColor | null;
  ready: boolean;
};

type FriendSummary = {
  presence: "offline" | "online";
  userId: string;
  username: string;
};

type RoomConfig = {
  timersEnabled: boolean;
  readingTimeSeconds: number;
  clueSelectionTimeSeconds: number;
  revealedClueAnalysisTimeSeconds: number;
  roundAnalysisTimeSeconds: number;
  finalGuessTimeSeconds: number;
  trueCluesPerPlayer: number;
  cluesPerPlayer: number;
};

type NumericRoomConfigKey = Exclude<keyof RoomConfig, "timersEnabled">;

type Room = {
  code: string;
  mode: "custom" | "casual" | "ranked";
  users: RoomUser[];
  userCount: number;
  activecase: string | null;
  selectedcase: string | null;
  caseSelectionMode: "generate" | "manual" | "automatic";
  allReady: boolean;
  config: RoomConfig;
};

type RoomPreview = {
  canJoin: boolean;
  code: string;
  joinBlockedReason: string | null;
  mode: "custom" | "casual" | "ranked";
  userCount: number;
};

type CaseSummary = {
  id: string;
  title: string;
  totalClues: number;
  falseCluePercentage: number;
};

const CASE_CREATION_NOTICE_KEY = "contrapista-case-creation-notice";

const colorOptions = Object.entries(PLAYER_COLORS) as Array<
  [PlayerColor, (typeof PLAYER_COLORS)[PlayerColor]]
>;

const DEFAULT_ROOM_CONFIG: RoomConfig = {
  timersEnabled: true,
  readingTimeSeconds: 120,
  clueSelectionTimeSeconds: 20,
  revealedClueAnalysisTimeSeconds: 40,
  roundAnalysisTimeSeconds: 60,
  finalGuessTimeSeconds: 60,
  trueCluesPerPlayer: 67,
  cluesPerPlayer: 3,
};

const ROOM_CONFIG_PRESETS = [
  {
    name: "Jogo Clássico",
    config: DEFAULT_ROOM_CONFIG,
  },
  {
    name: "Jogo Pesadelo",
    config: {
      ...DEFAULT_ROOM_CONFIG,
      readingTimeSeconds: 60,
      clueSelectionTimeSeconds: 10,
      revealedClueAnalysisTimeSeconds: 20,
      roundAnalysisTimeSeconds: 10,
      finalGuessTimeSeconds: 60,
      trueCluesPerPlayer: 50,
      cluesPerPlayer: 2,
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
    min: 30,
    max: 120,
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
    label: "Pistas verdadeiras",
    description: "Percentual aproximado de evidências confiáveis no conjunto total.",
    group: "dossie",
    suffix: "%",
    min: 0,
    max: 100,
    step: 5,
  },
] satisfies Array<{
  key: NumericRoomConfigKey;
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
    title: "Ritmo da mesa",
    description: "Tempos de leitura, escolha, discussão e resposta.",
  },
  {
    id: "dossie",
    title: "Estrutura do dossiê",
    description: "Volume de pistas por pessoa e proporção do conjunto confiável.",
  },
] satisfies Array<{
  id: "ritmo" | "dossie";
  title: string;
  description: string;
}>;

function configsMatch(left: RoomConfig, right: RoomConfig, playerCount = 1) {
  const normalizedRight = snapRoomConfigToPlayerCount(right, playerCount);

  return (
    left.timersEnabled === normalizedRight.timersEnabled &&
    configFields.every((field) => left[field.key] === normalizedRight[field.key])
  );
}

function getTrueCluePercentageStates(playerCount: number, cluesPerPlayer: number) {
  const stepCount = Math.max(1, Math.max(1, playerCount) * Math.max(1, cluesPerPlayer));

  return Array.from({ length: stepCount + 1 }, (_, index) =>
    Math.round((index * 100) / stepCount),
  );
}

function snapToClosestState(value: number, states: number[]) {
  return states.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
  );
}

function getAdjacentState(value: number, states: number[], direction: -1 | 1) {
  const currentIndex = states.indexOf(snapToClosestState(value, states));
  const nextIndex = Math.min(
    states.length - 1,
    Math.max(0, currentIndex + direction),
  );

  return states[nextIndex];
}

function snapRoomConfigToPlayerCount(config: RoomConfig, playerCount: number) {
  const trueClueStates = getTrueCluePercentageStates(
    playerCount,
    config.cluesPerPlayer,
  );

  return {
    ...config,
    trueCluesPerPlayer: snapToClosestState(
      config.trueCluesPerPlayer,
      trueClueStates,
    ),
  };
}

function hasCompleteProfile(user: RoomUser | null | undefined) {
  return Boolean(user?.nickname && user.color);
}

function getUserName(user: RoomUser) {
  return user.nickname ?? "Sem identificação";
}

function getUserColorHex(color: PlayerColor | null | undefined) {
  return color ? PLAYER_COLORS[color]?.hex ?? "#d7b861" : "#6b7280";
}

function getUserColorName(color: PlayerColor | null | undefined) {
  return color ? PLAYER_COLORS[color]?.name ?? "Cor indisponível" : "Sem cor";
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const [room, setRoom] = useState<Room | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  const [color, setColor] = useState<PlayerColor | "">("");
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRoomMissing, setIsRoomMissing] = useState(false);
  const [isCasePickerOpen, setIsCasePickerOpen] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [socialMessage, setSocialMessage] = useState("");
  const [caseOptions, setCaseOptions] = useState<CaseSummary[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [configDraft, setConfigDraft] = useState<RoomConfig>(DEFAULT_ROOM_CONFIG);
  const isConfigDirtyRef = useRef(false);
  const isHeartbeatInFlightRef = useRef(false);
  const isLoadingRoomRef = useRef(false);
  const noticeRef = useRef(notice);

  useEffect(() => {
    noticeRef.current = notice;
  }, [notice]);

  useEffect(() => {
    if (!isSocialOpen) {
      return;
    }

    let ignore = false;
    const timeout = window.setTimeout(() => {
      fetch("/api/users/me/friends", { cache: "no-store" })
        .then((response) => readJsonResponse<{
          dashboard?: { friends?: FriendSummary[] };
          error?: string;
        }>(response))
        .then((payload) => {
          if (!ignore) {
            setFriends(payload.dashboard?.friends ?? []);
          }
        })
        .catch((caughtError) => {
          if (!ignore) {
            setSocialMessage(
              caughtError instanceof Error
                ? caughtError.message
                : "Não deu para abrir sua rede.",
            );
          }
        });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
    };
  }, [isSocialOpen]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setUserId(readSavedSession(code)?.user.id ?? null);

      const storedNotice = sessionStorage.getItem(CASE_CREATION_NOTICE_KEY);

      if (storedNotice) {
        sessionStorage.removeItem(CASE_CREATION_NOTICE_KEY);
        setNotice(storedNotice);
      } else {
        setNotice("");
      }

      setIsSessionLoaded(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [code]);

  useEffect(() => {
    if (!isSessionLoaded) {
      return;
    }

    let isActive = true;

    async function loadRoom() {
      if (isLoadingRoomRef.current) {
        return;
      }

      isLoadingRoomRef.current = true;

      try {
        const response = await fetch(`/api/rooms/${code}`, {
          cache: "no-store",
        });
        const data = await readJsonResponse<{
          error?: string;
          room?: Room;
          roomPreview?: RoomPreview;
        }>(response);

        if (!isActive) {
          return;
        }

        if (response.status === 404) {
          setIsRoomMissing(true);
          setRoom(null);
          return;
        }

        if (response.ok && !data.room && data.roomPreview) {
          setRoom(null);
          setIsRoomMissing(false);
          setError(
            data.roomPreview.canJoin
              ? ""
              : data.roomPreview.joinBlockedReason ??
                  "Mesa em andamento. Aguarde o fim da partida.",
          );
          return;
        }

        if (!response.ok || !data.room) {
          throw new Error(data.error ?? "Não deu para atualizar a ante-sala.");
        }

        setRoom(data.room);

        if (!isConfigDirtyRef.current) {
          setConfigDraft(
            snapRoomConfigToPlayerCount(
              data.room.config ?? DEFAULT_ROOM_CONFIG,
              data.room.users.length,
            ),
          );
        }

        setIsRoomMissing(false);

        const leftCaseId = localStorage.getItem(leftCaseStorageKey(code));

        if (!data.room.activecase && leftCaseId) {
          localStorage.removeItem(leftCaseStorageKey(code));
        }

        const isCurrentUserInRoom = Boolean(
          userId && data.room.users.some((user) => user.id === userId),
        );

        if (!isCurrentUserInRoom && (data.room.activecase || data.room.allReady)) {
          setError("Mesa em andamento. Aguarde o fim da partida.");
          return;
        }

        if (userId && !isCurrentUserInRoom) {
          clearSession(code);
          setUserId(null);
          setError("Você foi removido da sala.");
          return;
        }

        if (data.room.activecase && data.room.activecase !== leftCaseId) {
          router.replace(`/sala/${code}/jogo`);
          return;
        }

        if (!data.room.activecase && data.room.allReady && !noticeRef.current) {
          router.replace(`/sala/${code}/criando-caso`);
        }
      } catch (caughtError) {
        if (isActive) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Não deu para atualizar a ante-sala.",
          );
        }
      } finally {
        isLoadingRoomRef.current = false;
      }
    }

    loadRoom();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadRoom();
      }
    }, 2000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, isSessionLoaded, router, userId]);

  const currentUser = room?.users.find((user) => user.id === userId);
  const currentUserId = currentUser?.id;
  const isMatchmadeRoom = room?.mode === "casual" || room?.mode === "ranked";
  const canEditConfig = Boolean(
    currentUser &&
      !isMatchmadeRoom &&
      room?.users[0]?.id === currentUser.id &&
      !room.activecase,
  );
  const caseSelectionMode = room?.caseSelectionMode ?? "generate";
  const selectedCase = caseOptions.find((item) => item.id === room?.selectedcase);
  const configPlayerCount = room?.users.length ?? 1;
  const roomConfigSnapshot = snapRoomConfigToPlayerCount(
    room?.config ?? DEFAULT_ROOM_CONFIG,
    configPlayerCount,
  );
  const isConfigDirty =
    canEditConfig && !configsMatch(configDraft, roomConfigSnapshot, configPlayerCount);

  useEffect(() => {
    isConfigDirtyRef.current = isConfigDirty;
  }, [isConfigDirty]);

  useEffect(() => {
    if (canEditConfig || !isConfigDirtyRef.current) {
      return;
    }

    isConfigDirtyRef.current = false;
    setConfigDraft(
      snapRoomConfigToPlayerCount(
        room?.config ?? DEFAULT_ROOM_CONFIG,
        room?.users.length ?? 1,
      ),
    );
  }, [canEditConfig, room?.config, room?.users.length]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    saveSession({
      roomCode: code,
      user: currentUser,
    });
  }, [code, currentUser, currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    let isActive = true;

    async function heartbeat() {
      if (isHeartbeatInFlightRef.current) {
        return;
      }

      isHeartbeatInFlightRef.current = true;

      try {
        const response = await fetch(`/api/rooms/${code}/heartbeat`, withCsrfHeader({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUserId }),
        }));
        const data = await readJsonResponse<{ room?: Room }>(response);

        if (isActive && response.ok && data.room) {
          setRoom(data.room);

          if (!isConfigDirtyRef.current) {
            setConfigDraft(
              snapRoomConfigToPlayerCount(
                data.room.config ?? DEFAULT_ROOM_CONFIG,
                data.room.users.length,
              ),
            );
          }
        }
      } catch {
        // O polling da sala exibe erro se a conexão realmente cair.
      } finally {
        isHeartbeatInFlightRef.current = false;
      }
    }

    void heartbeat();
    const interval = window.setInterval(heartbeat, 30_000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [code, currentUserId]);

  async function join(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const data = await requestJson<{ room: Room; user: RoomUser }>(
        `/api/rooms/${code}/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ browserId: getBrowserId() }),
        },
        "Não deu para entrar na sala.",
      );

      saveSession({
        roomCode: code,
        user: data.user,
      });
      setUserId(data.user.id);
      setRoom(data.room);
      isConfigDirtyRef.current = false;
      setConfigDraft(
        snapRoomConfigToPlayerCount(
          data.room.config ?? DEFAULT_ROOM_CONFIG,
          data.room.users.length,
        ),
      );
      setColor(data.user.color ?? "");
      setIsEditing(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para entrar na sala.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function updateUser(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentUser) {
      return;
    }

    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const data = await requestJson<{ room: Room; user: RoomUser }>(
        `/api/rooms/${code}/users/${currentUser.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ color }),
        },
        "Não deu para salvar sua cor.",
      );

      saveSession({
        roomCode: code,
        user: data.user,
      });
      setRoom(data.room);
      isConfigDirtyRef.current = false;
      setConfigDraft(
        snapRoomConfigToPlayerCount(
          data.room.config ?? DEFAULT_ROOM_CONFIG,
          data.room.users.length,
        ),
      );
      setColor(data.user.color ?? "");
      setIsEditing(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para salvar sua cor.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function updateConfigDraft(key: NumericRoomConfigKey, value: string) {
    if (!canEditConfig || isSaving) {
      return;
    }

    const field = configFields.find((item) => item.key === key);
    const numericValue = Number(value);

    if (!field || !Number.isFinite(numericValue)) {
      return;
    }

    isConfigDirtyRef.current = true;

    setConfigDraft((current) => {
      const playerCount = Math.max(1, room?.users.length ?? 1);
      const rawValue = Math.min(field.max, Math.max(field.min, Math.round(numericValue)));
      const nextCluesPerPlayer =
        key === "cluesPerPlayer" ? rawValue : current.cluesPerPlayer;
      const trueClueStates = getTrueCluePercentageStates(
        playerCount,
        nextCluesPerPlayer,
      );
      const nextValue =
        key === "trueCluesPerPlayer"
          ? snapToClosestState(rawValue, trueClueStates)
          : rawValue;
      const next = {
        ...current,
        [key]: nextValue,
      };

      if (key === "cluesPerPlayer") {
        next.trueCluesPerPlayer = snapToClosestState(
          next.trueCluesPerPlayer,
          trueClueStates,
        );
      }

      return {
        ...next,
      };
    });
  }

  function applyConfigPreset(config: RoomConfig) {
    if (!canEditConfig || isSaving) {
      return;
    }

    isConfigDirtyRef.current = true;
    setConfigDraft(
      snapRoomConfigToPlayerCount(config, room?.users.length ?? 1),
    );
  }

  function toggleTimersEnabled() {
    if (!canEditConfig || isSaving) {
      return;
    }

    isConfigDirtyRef.current = true;
    setConfigDraft((current) => ({
      ...current,
      timersEnabled: !current.timersEnabled,
    }));
  }

  function cancelConfigChanges() {
    if (!canEditConfig || isSaving) {
      return;
    }

    isConfigDirtyRef.current = false;
    setConfigDraft(
      snapRoomConfigToPlayerCount(
        room?.config ?? DEFAULT_ROOM_CONFIG,
        room?.users.length ?? 1,
      ),
    );
  }

  async function saveRoomConfig() {
    if (!currentUser || !canEditConfig || !isConfigDirty) {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const data = await requestJson<{ room: Room }>(
        `/api/rooms/${code}/config`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUser.id, config: configDraft }),
        },
        "Não deu para salvar a mesa.",
      );

      setRoom(data.room);
      isConfigDirtyRef.current = false;
      setConfigDraft(
        snapRoomConfigToPlayerCount(
          data.room.config ?? DEFAULT_ROOM_CONFIG,
          data.room.users.length,
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para salvar a mesa.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function loadCaseOptions() {
    setError("");
    setIsLoadingCases(true);

    try {
      const data = await requestJson<{
        cases: CaseSummary[];
        room: Room;
      }>(
        `/api/rooms/${code}/case/selection`,
        { method: "GET" },
        "Não deu para abrir o arquivo.",
      );

      setCaseOptions(data.cases);
      setRoom(data.room);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para abrir o arquivo.",
      );
    } finally {
      setIsLoadingCases(false);
    }
  }

  function openCasePicker() {
    if (!canEditConfig || isSaving) {
      return;
    }

    setIsCasePickerOpen(true);
    void loadCaseOptions();
  }

  async function updateCaseSelectionMode({
    caseId = null,
    mode,
  }: {
    caseId?: string | null;
    mode: Room["caseSelectionMode"];
  }) {
    if (!currentUser || !canEditConfig || isSaving) {
      return;
    }

    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const data = await requestJson<{ room: Room }>(
        `/api/rooms/${code}/case/selection`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId, mode, userId: currentUser.id }),
        },
        "Não deu para escolher o caso.",
      );

      setRoom(data.room);
      setIsCasePickerOpen(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para escolher o caso.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function selectCase(caseId: string) {
    return updateCaseSelectionMode({ caseId, mode: "manual" });
  }

  async function toggleReady(ready: boolean) {
    if (!currentUser) {
      return;
    }

    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      const data = await requestJson<{ room: Room }>(
        `/api/rooms/${code}/ready`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUser.id, ready }),
        },
        "Não deu para mudar prontidão.",
      );

      setRoom(data.room);

      if (!isConfigDirtyRef.current) {
        setConfigDraft(
          snapRoomConfigToPlayerCount(
            data.room.config ?? DEFAULT_ROOM_CONFIG,
            data.room.users.length,
          ),
        );
      }

      if (data.room.activecase) {
        router.push(`/sala/${code}/jogo`);
        return;
      }

      if (ready && room?.selectedcase && !data.room.selectedcase && !data.room.allReady) {
        setNotice(
          "O caso escolhido não comporta a mesa atual.",
        );
      }

      if (
        ready &&
        room?.caseSelectionMode === "automatic" &&
        data.room.caseSelectionMode === "automatic" &&
        !data.room.activecase &&
        !data.room.allReady
      ) {
        setNotice(
          "Nenhum caso pronto comporta a mesa atual.",
        );
      }

      if (!data.room.activecase && data.room.allReady) {
        router.push(`/sala/${code}/criando-caso`);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para mudar prontidão.",
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
      const data = await requestJson<{ room: Room | null }>(
        `/api/rooms/${code}/leave`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: currentUser.id }),
        },
        "Não deu para sair da sala.",
      );

      clearSession(code);
      setUserId(null);
      setRoom(data.room);
      isConfigDirtyRef.current = false;
      setConfigDraft(
        snapRoomConfigToPlayerCount(
          data.room?.config ?? DEFAULT_ROOM_CONFIG,
          data.room?.users.length ?? 1,
        ),
      );
      setIsEditing(false);

      router.push("/");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para sair da sala.",
      );
    }
  }

  async function sendFriendRequestToRoomUser(user: RoomUser) {
    setSocialMessage("");

    try {
      const data = await requestJson<{ ok?: boolean; error?: string }>(
        "/api/users/me/friends",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username: getUserName(user) }),
        },
        "Não deu para enviar o pedido.",
      );

      if (data.ok === false) {
        throw new Error(data.error ?? "Não deu para enviar o pedido.");
      }

      setSocialMessage(`Pedido enviado para ${getUserName(user)}.`);
      const response = await fetch("/api/users/me/friends", { cache: "no-store" });
      const payload = await readJsonResponse<{
        dashboard?: { friends?: FriendSummary[] };
      }>(response);

      setFriends(payload.dashboard?.friends ?? []);
    } catch (caughtError) {
      setSocialMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para enviar o pedido.",
      );
    }
  }

  async function kickUserFromRoom(targetUser: RoomUser) {
    if (!currentUser || !canEditConfig) {
      return;
    }

    setSocialMessage("");
    setIsSaving(true);

    try {
      const data = await requestJson<{ room: Room | null }>(
        `/api/rooms/${code}/users/${targetUser.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ leaderUserId: currentUser.id }),
        },
        "Não deu para remover o jogador.",
      );

      setRoom(data.room);
      setConfigDraft(
        snapRoomConfigToPlayerCount(
          data.room?.config ?? DEFAULT_ROOM_CONFIG,
          data.room?.users.length ?? 1,
        ),
      );
      setSocialMessage(`${getUserName(targetUser)} saiu da sala.`);
    } catch (caughtError) {
      setSocialMessage(
        caughtError instanceof Error
          ? caughtError.message
          : "Não deu para remover o jogador.",
      );
    } finally {
      setIsSaving(false);
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

  const currentUserHasProfile = hasCompleteProfile(currentUser);
  const showProfileForm = !currentUser || isEditing || !currentUserHasProfile;
  const usedColors = new Set(
    room?.users
      .filter((user) => user.id !== currentUser?.id)
      .filter((user) => user.color)
      .map((user) => user.color),
  );
  const readyCount =
    room?.users.filter((user) => hasCompleteProfile(user) && user.ready).length ?? 0;
  const canSubmitProfile = currentUser ? Boolean(color) : true;
  const roomMemberAccountIds = new Set(
    room?.users
      .map((user) => user.accountUserId)
      .filter((id): id is string => Boolean(id)) ?? [],
  );
  const friendUserIds = new Set(friends.map((friend) => friend.userId));
  const canUseSocial = Boolean(room && !isMatchmadeRoom && !room.activecase);

  return (
    <main className="sy-theme min-h-screen overflow-hidden bg-[#10130f] px-3 py-4 text-stone-50 sm:px-6 sm:py-8 lg:px-8">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <section className="relative mx-auto w-full max-w-7xl">
        <header className="grid gap-4 border-b border-[#d7b861]/25 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:pb-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c8a24a] sm:text-sm sm:tracking-[0.28em]">
                Sala reservada
              </p>
              {currentUser ? (
                <LeaveRoomButton onClick={leave} />
              ) : (
                <Link
                  className="text-sm font-semibold text-[#d7b861]"
                  href="/"
                >
                  Voltar ao início
                </Link>
              )}
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-tight text-[#fff3cf] sm:text-5xl">
              Ante-sala do caso
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300 sm:mt-3 sm:text-base">
              Escolha uma cor e confirme presença.
            </p>
          </div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 rounded-lg border border-[#d7b861]/40 bg-[#171b16] px-4 py-3 shadow-2xl shadow-black/25 sm:block sm:px-6 sm:py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#c8a24a]">
              Código
            </p>
            <p className="justify-self-end font-mono text-3xl font-bold tracking-[0.24em] text-[#fff3cf] sm:mt-1 sm:text-4xl sm:tracking-[0.32em]">
              {code}
            </p>
            <p className="col-span-2 mt-1 text-sm text-stone-400 sm:mt-2">
              {readyCount}/{room?.userCount ?? 0} prontos
            </p>
          </div>
        </header>

        {showProfileForm ? (
          <form
            className="mt-6 grid gap-5 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-5 shadow-2xl shadow-black md:grid-cols-[1fr_auto] lg:p-6"
            onSubmit={currentUser ? updateUser : join}
          >
            <div>
              <p className="text-sm font-semibold text-[#d7b861]">
                Identificação
              </p>
              <p className="mt-2 rounded-lg border border-stone-700 bg-[#0f120e] px-4 py-3 text-lg font-semibold text-[#fff3cf]">
                {currentUser ? getUserName(currentUser) : "Entrar com seu nome"}
              </p>

              {currentUser ? (
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
              ) : (
                <p className="mt-4 max-w-xl text-sm leading-6 text-stone-300">
                  Entre, escolha uma cor e aguarde a mesa.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 self-end sm:flex-row md:flex-col">
              {currentUser ? (
                <button
                  className="h-14 rounded-lg border border-stone-600 px-8 font-semibold text-stone-100 transition hover:bg-white/10"
                  onClick={() => {
                    setIsEditing(false);
                    setColor(currentUser.color ?? "");
                  }}
                  type="button"
                >
                  Cancelar
                </button>
              ) : null}
              <button
                className="h-14 rounded-lg bg-[#d7b861] px-8 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving || !canSubmitProfile}
                type="submit"
              >
                {currentUser ? "Salvar cor" : "Entrar na mesa"}
              </button>
            </div>
          </form>
        ) : (
          <div
            className="current-player-card mt-6 flex flex-col justify-between gap-4 rounded-lg border px-5 py-4 shadow-2xl shadow-black/20 sm:flex-row sm:items-center"
            style={{
              borderColor: `${getUserColorHex(currentUser.color)}66`,
              "--player-color": getUserColorHex(currentUser.color),
            } as CSSProperties}
          >
            <div className="flex items-center gap-4">
              <span
                className="h-12 w-12 rounded-full border-2 border-white/50"
                style={{ backgroundColor: getUserColorHex(currentUser.color) }}
              />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#d7b861]">
                  Sua identificação
                </p>
                <p className="text-2xl font-bold text-[#fff3cf]">
                  {getUserName(currentUser)}
                </p>
                <p className="text-sm text-stone-300">
                  {getUserColorName(currentUser.color)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="h-11 rounded-lg border border-stone-600 bg-[#0f120e] px-5 font-semibold text-stone-100 shadow-sm transition hover:border-[#d7b861]"
                onClick={() => {
                  setColor(currentUser.color ?? "");
                  setIsEditing(true);
                }}
                type="button"
              >
                Alterar cor
              </button>
              <button
                className="h-11 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] shadow-sm transition hover:bg-[#f3dfaa]"
                disabled={!currentUserHasProfile}
                onClick={() => toggleReady(!currentUser.ready)}
                type="button"
              >
                {currentUser.ready ? "Cancelar pronto" : "Pronto"}
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
            <div className="flex items-center gap-2">
              {canUseSocial ? (
                <button
                  className="rounded-full border border-[#d7b861]/40 bg-[#171b16] px-4 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#fff3cf] transition hover:bg-[#d7b861]/10"
                  onClick={() => {
                    setSocialMessage("");
                    setIsSocialOpen(true);
                  }}
                  type="button"
                >
                  Social
                </button>
              ) : null}
              <span className="rounded-full border border-[#d7b861]/40 bg-[#171b16] px-3 py-1 text-sm font-semibold text-[#d7b861]">
                {room?.userCount ?? 0}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {room?.users.map((user, index) => (
              <article
                className="player-card relative overflow-hidden rounded-lg border bg-[#171b16] p-5 shadow-2xl shadow-black/20"
                key={user.id}
                style={{
                  borderColor: `${getUserColorHex(user.color)}66`,
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-2"
                  style={{ backgroundColor: getUserColorHex(user.color) }}
                />
                {index === 0 && !isMatchmadeRoom ? (
                  <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#d7b861]/60 bg-[#0f120e] text-lg text-[#d7b861] shadow-lg" title="Líder da investigação">
                    ♛
                  </div>
                ) : null}

                <div className="flex items-start justify-between gap-4 pt-3">
                  <div className="min-w-0 pr-12">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d7b861]">
                      {getUserColorName(user.color)}
                      {user.id === userId ? " / Você" : ""}
                      {index === 0 && !isMatchmadeRoom ? " / Líder" : ""}
                    </p>
                    <h3 className="mt-2 truncate text-3xl font-black text-[#fff3cf]">
                      {getUserName(user)}
                    </h3>
                  </div>
                  <span
                    className="h-14 w-14 shrink-0 rounded-full border-2 border-white/40 shadow-lg"
                    style={{ backgroundColor: getUserColorHex(user.color) }}
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
                Ainda não há participantes na mesa.
              </p>
            ) : null}
          </div>
        </section>

        {isMatchmadeRoom ? (
          <section className="mt-7 rounded-lg border border-[#d7b861]/25 bg-[#171b16] px-6 py-5 shadow-2xl shadow-black/20">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
              Partida pareada
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
              Mesa clássica
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
              Partida {room?.mode === "ranked" ? "rankeada" : "casual"} para 4
              jogadores, cada um por si.
            </p>
          </section>
        ) : (
          <>
          <section className="mt-7 rounded-lg border border-[#d7b861]/30 bg-[#171b16] px-6 py-5 shadow-2xl shadow-black/20">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
                  Caso da mesa
                </p>
                <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                  {room?.caseSelectionMode === "manual"
                    ? "Caso existente vinculado"
                    : room?.caseSelectionMode === "automatic"
                      ? "Escolha automática"
                      : "Geração de caso"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                  {room?.caseSelectionMode === "manual"
                    ? `A sala irá direto para o jogo quando todos ficarem prontos${selectedCase ? `: ${selectedCase.title}` : "."}`
                    : room?.caseSelectionMode === "automatic"
                      ? "Quando todos ficarem prontos, a mesa sorteia um caso compatível."
                      : "Quando todos ficarem prontos, a mesa cria um caso novo."}
                </p>
              </div>
              <div
                aria-label="Modo de caso da mesa"
                className="grid w-full gap-2 sm:grid-cols-3 lg:w-[34rem]"
                role="radiogroup"
              >
                <button
                  aria-checked={caseSelectionMode === "generate"}
                  className={`min-h-24 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    caseSelectionMode === "generate"
                      ? "border-[#f3dfaa] bg-[#d7b861] text-[#17130d] shadow-[0_0_0_3px_rgba(215,184,97,0.22)]"
                      : "border-[#d7b861]/25 bg-[#0f120e] text-stone-200 hover:border-[#d7b861]/75 hover:bg-[#171b16]"
                  }`}
                  disabled={!canEditConfig || isSaving || caseSelectionMode === "generate"}
                  onClick={() => updateCaseSelectionMode({ mode: "generate" })}
                  role="radio"
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-black uppercase tracking-[0.12em]">
                    Gerar
                    <span
                      className={`h-3 w-3 rounded-full border ${
                        caseSelectionMode === "generate"
                          ? "border-[#17130d] bg-[#17130d]"
                          : "border-stone-500"
                      }`}
                    />
                  </span>
                  <span className="mt-2 block text-xs leading-5 opacity-85">
                    Cria um caso novo.
                  </span>
                </button>
                <button
                  aria-checked={caseSelectionMode === "automatic"}
                  className={`min-h-24 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    caseSelectionMode === "automatic"
                      ? "border-[#f3dfaa] bg-[#d7b861] text-[#17130d] shadow-[0_0_0_3px_rgba(215,184,97,0.22)]"
                      : "border-[#d7b861]/25 bg-[#0f120e] text-stone-200 hover:border-[#d7b861]/75 hover:bg-[#171b16]"
                  }`}
                  disabled={!canEditConfig || isSaving || caseSelectionMode === "automatic"}
                  onClick={() => updateCaseSelectionMode({ mode: "automatic" })}
                  role="radio"
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-black uppercase tracking-[0.12em]">
                    Automático
                    <span
                      className={`h-3 w-3 rounded-full border ${
                        caseSelectionMode === "automatic"
                          ? "border-[#17130d] bg-[#17130d]"
                          : "border-stone-500"
                      }`}
                    />
                  </span>
                  <span className="mt-2 block text-xs leading-5 opacity-85">
                    Sorteia um caso compatível.
                  </span>
                </button>
                <button
                  aria-checked={caseSelectionMode === "manual"}
                  className={`min-h-24 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    caseSelectionMode === "manual"
                      ? "border-[#f3dfaa] bg-[#d7b861] text-[#17130d] shadow-[0_0_0_3px_rgba(215,184,97,0.22)]"
                      : "border-[#d7b861]/25 bg-[#0f120e] text-stone-200 hover:border-[#d7b861]/75 hover:bg-[#171b16]"
                  }`}
                  disabled={!canEditConfig || isSaving}
                  onClick={openCasePicker}
                  role="radio"
                  type="button"
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-black uppercase tracking-[0.12em]">
                    Manual
                    <span
                      className={`h-3 w-3 rounded-full border ${
                        caseSelectionMode === "manual"
                          ? "border-[#17130d] bg-[#17130d]"
                          : "border-stone-500"
                      }`}
                    />
                  </span>
                  <span className="mt-2 block text-xs leading-5 opacity-85">
                    {selectedCase ? selectedCase.title : "Escolha no arquivo."}
                  </span>
                </button>
              </div>
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
                  Ajuste o ritmo e salve antes da largada.
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
                    : "Mesa pronta"
                  : "Apenas o líder altera"}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-[#d7b861]/20 bg-[#171b16] p-3 text-sm font-semibold text-stone-300">
              <span className="rounded-full bg-[#0f120e] px-3 py-1">
                Timers {configDraft.timersEnabled ? "ligados" : "desligados"}
              </span>
              <span className="rounded-full bg-[#0f120e] px-3 py-1">
                {configDraft.trueCluesPerPlayer}% pistas verdadeiras
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
                const presetConfig = snapRoomConfigToPlayerCount(
                  preset.config,
                  room?.users.length ?? 1,
                );
                const isActivePreset = configsMatch(
                  configDraft,
                  preset.config,
                  room?.users.length ?? 1,
                );

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
                      {presetConfig.cluesPerPlayer} pistas por pessoa, {presetConfig.trueCluesPerPlayer}% verdadeiras, resposta de {presetConfig.finalGuessTimeSeconds}s.
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
                    {group.id === "ritmo" ? (
                      <button
                        aria-pressed={configDraft.timersEnabled}
                        className={`inline-flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-xs font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          configDraft.timersEnabled
                            ? "border-[#d7b861]/45 bg-[#d7b861]/10 text-[#f5e7bd]"
                            : "border-stone-600 bg-[#171b16] text-stone-300 hover:border-[#d7b861]/55"
                        }`}
                        disabled={!canEditConfig || isSaving}
                        onClick={toggleTimersEnabled}
                        type="button"
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            configDraft.timersEnabled
                              ? "bg-[#d7b861]"
                              : "bg-stone-600"
                          }`}
                        />
                        Timers {configDraft.timersEnabled ? "ligados" : "desligados"}
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {configFields
                      .filter((field) => field.group === group.id)
                      .map((field) => {
                        const max = field.max;
                        const value = configDraft[field.key];
                        const playerCount = Math.max(1, room?.users.length ?? 1);
                        const trueClueStates = getTrueCluePercentageStates(
                          playerCount,
                          configDraft.cluesPerPlayer,
                        );
                        const isTrueCluePercentage =
                          field.key === "trueCluesPerPlayer";
                        const decrementValue = isTrueCluePercentage
                          ? getAdjacentState(value, trueClueStates, -1)
                          : value - field.step;
                        const incrementValue = isTrueCluePercentage
                          ? getAdjacentState(value, trueClueStates, 1)
                          : value + field.step;
                        const inputStep = isTrueCluePercentage ? 1 : field.step;
                        const trueClueCount = isTrueCluePercentage
                          ? Math.round(
                              (playerCount * configDraft.cluesPerPlayer * value) / 100,
                            )
                          : 0;

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
                                onClick={() =>
                                  updateConfigDraft(field.key, String(decrementValue))
                                }
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
                                step={inputStep}
                                type="range"
                                value={value}
                              />
                              <button
                                aria-label={`Aumentar ${field.label}`}
                                className="flex h-10 w-10 items-center justify-center rounded-lg border border-stone-700 bg-[#0f120e] text-lg font-black text-stone-100 transition hover:border-[#d7b861] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={!canEditConfig || isSaving || value >= max}
                                onClick={() =>
                                  updateConfigDraft(field.key, String(incrementValue))
                                }
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
                                  step={inputStep}
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

                            {isTrueCluePercentage ? (
                              <p className="mt-3 text-xs font-semibold text-stone-500">
                                {trueClueCount} de {playerCount * configDraft.cluesPerPlayer} cartas verdadeiras
                              </p>
                            ) : null}
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
                    ? "Revise e salve."
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
                    {isSaving ? "Salvando" : "Salvar mesa"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
          </>
        )}

        {isSocialOpen && canUseSocial ? (
          <ResponsiveSheet
            backdropClassName="bg-black/70 backdrop-blur-sm"
            contentClassName="max-w-3xl border border-[#d7b861]/35 bg-[#171b16] p-4 text-stone-50 shadow-black/50 sm:w-[48rem] sm:p-6"
          >
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
                    Social
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    Mesa e amigos
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                    Veja quem está na sala e convide amigos online.
                  </p>
                </div>
                <button
                  aria-label="Fechar social"
                  className="h-9 w-9 rounded-lg border border-stone-600 text-lg font-bold text-stone-200 transition hover:border-[#d7b861]"
                  onClick={() => setIsSocialOpen(false)}
                  type="button"
                >
                  X
                </button>
              </div>

              <section className="mt-6 rounded-lg border border-[#d7b861]/25 bg-[#0f120e] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-serif text-2xl font-bold text-[#fff3cf]">
                    Membros na sala
                  </h3>
                  <span className="rounded-full border border-[#d7b861]/30 px-3 py-1 text-xs font-bold text-[#d7b861]">
                    {room?.users.length ?? 0}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {room?.users.map((user, index) => {
                    const isSelf = user.id === currentUser?.id;
                    const isFriend = Boolean(
                      user.accountUserId && friendUserIds.has(user.accountUserId),
                    );

                    return (
                      <article
                        className="rounded-lg border border-[#d7b861]/20 bg-[#171b16] p-4"
                        key={user.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-serif text-xl font-bold text-[#fff3cf]">
                              {getUserName(user)}
                            </p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-stone-500">
                              {isSelf ? "Você" : isFriend ? "Amigo" : "Participante"}
                              {index === 0 ? " / Líder" : ""}
                            </p>
                          </div>
                          <span
                            className="h-9 w-9 shrink-0 rounded-full border border-white/35"
                            style={{ backgroundColor: getUserColorHex(user.color) }}
                          />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {!isSelf && !isFriend ? (
                            <button
                              className="rounded-sm border border-[#d7b861]/40 px-3 py-2 text-xs font-bold text-[#fff3cf] transition hover:bg-[#d7b861]/10 disabled:opacity-60"
                              disabled={isSaving}
                              onClick={() => sendFriendRequestToRoomUser(user)}
                              type="button"
                            >
                              Fazer amizade
                            </button>
                          ) : null}
                          {canEditConfig && !isSelf ? (
                            <button
                              className="rounded-sm border border-red-400/40 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-950/35 disabled:opacity-60"
                              disabled={isSaving}
                              onClick={() => kickUserFromRoom(user)}
                              type="button"
                            >
                              Remover da sala
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="mt-5 rounded-lg border border-[#d7b861]/25 bg-[#0f120e] p-4">
                <h3 className="font-serif text-2xl font-bold text-[#fff3cf]">
                  Amigos online
                </h3>
                <FriendNetworkPanel
                  action="invite"
                  excludedUserIds={Array.from(roomMemberAccountIds)}
                  roomCode={code}
                  showSearch={false}
                  view="friends"
                />
              </section>

              {socialMessage ? (
                <p className="mt-4 rounded-lg border border-[#d7b861]/30 bg-[#2d2818]/80 px-4 py-3 text-sm font-semibold text-[#fff3cf]">
                  {socialMessage}
                </p>
              ) : null}
            </div>
          </ResponsiveSheet>
        ) : null}

        {isCasePickerOpen ? (
          <ResponsiveSheet
            backdropClassName="bg-black/70 backdrop-blur-sm"
            contentClassName="max-w-3xl border border-[#d7b861]/35 bg-[#171b16] p-4 text-stone-50 shadow-black/50 sm:w-[48rem] sm:p-6"
          >
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
                    Arquivo de casos
                  </p>
                  <h2 className="mt-2 font-serif text-3xl font-bold text-[#fff3cf]">
                    Escolha um caso pronto
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                    Só aparecem casos compatíveis com a mesa atual.
                  </p>
                </div>
                <button
                  aria-label="Fechar seleção de caso"
                  className="h-9 w-9 rounded-lg border border-stone-600 text-lg font-bold text-stone-200 transition hover:border-[#d7b861]"
                  onClick={() => setIsCasePickerOpen(false)}
                  type="button"
                >
                  X
                </button>
              </div>

              {isLoadingCases ? (
                <p className="mt-6 rounded-lg border border-[#d7b861]/20 bg-[#0f120e] p-5 text-stone-300">
                  Carregando casos...
                </p>
              ) : null}

              {!isLoadingCases && caseOptions.length === 0 ? (
                <p className="mt-6 rounded-lg border border-dashed border-stone-600 bg-[#0f120e] p-5 text-stone-300">
                  Nenhum caso disponível tem pistas suficientes para esta sala.
                </p>
              ) : null}

              <div className="mt-6 grid max-h-[55vh] gap-3 overflow-y-auto pr-1">
                {caseOptions.map((item) => {
                  const isSelected = item.id === room?.selectedcase;

                  return (
                    <button
                      className={`rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isSelected
                          ? "border-[#d7b861] bg-[#2a2112]"
                          : "border-[#d7b861]/25 bg-[#0f120e] hover:border-[#d7b861]"
                      }`}
                      disabled={isSaving || isSelected}
                      key={item.id}
                      onClick={() => selectCase(item.id)}
                      type="button"
                    >
                      <span className="font-serif text-2xl font-bold text-[#fff3cf]">
                        {item.title}
                      </span>
                      <span className="mt-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.14em] text-stone-400">
                        <span className="rounded-full border border-[#d7b861]/25 px-3 py-1">
                          {item.totalClues} pistas
                        </span>
                        <span className="rounded-full border border-[#d7b861]/25 px-3 py-1">
                          {item.falseCluePercentage}% falsas
                        </span>
                        {isSelected ? (
                          <span className="rounded-full bg-[#d7b861] px-3 py-1 text-[#17130d]">
                            Selecionado
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </ResponsiveSheet>
        ) : null}
      </section>
    </main>
  );
}
