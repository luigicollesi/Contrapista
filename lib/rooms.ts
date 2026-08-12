import { chatCompletion, getAvailableAiModelCount } from "@/lib/ai";
import { AiModelsUnavailableError } from "@/lib/ai/errors";
import { PublicError } from "@/lib/api-response";
import { dbQuery, getDbClient, type DatabaseClient } from "@/lib/db";
import { touchUserPresence } from "@/lib/friends";
import {
  recordEliminatedPlayerHistory,
  recordMatchHistory,
} from "@/lib/match-history";
import {
  isPlayerColor,
  normalizePlayerColor,
  type PlayerColor,
} from "@/lib/player-colors";
import { getMinimumCluesPerPlayer } from "@/lib/room-config";
import { validateDisplayNamePolicy } from "@/lib/name-policy";

export type RoomUser = {
  id: string;
  accountUserId?: string | null;
  browserId: string;
  nickname: string | null;
  color: PlayerColor | null;
  ready: boolean;
  joinedAt: number;
  lastSeenAt: number;
};

export type RoomConfig = {
  timersEnabled: boolean;
  readingTimeSeconds: number;
  clueSelectionTimeSeconds: number;
  revealedClueAnalysisTimeSeconds: number;
  roundAnalysisTimeSeconds: number;
  finalGuessTimeSeconds: number;
  trueCluesPerPlayer: number;
  cluesPerPlayer: number;
};

export type RoomMode = "custom" | "casual" | "ranked";
export type CaseSelectionMode = "generate" | "manual" | "automatic";

export type Room = {
  code: string;
  users: RoomUser[];
  activecase: string | null;
  selectedcase?: string | null;
  caseSelectionMode?: CaseSelectionMode;
  activeevent: RoomEvent | null;
  gamestate: GameState | null;
  config?: RoomConfig;
  mode?: RoomMode;
};

export type RoomEvent = {
  id: string;
  type:
    | "solution"
    | "solution_pending"
    | "solution_manual_review"
    | "solution_correct"
    | "solution_wrong"
    | "solution_no_winner";
  actorId: string;
  actorNickname: string;
  createdAt: number;
  guess?: string;
};

export type GameState = {
  matchId?: string;
  phase: "ready" | "reading" | "roulette" | "turn" | "shared_clue" | "pause";
  round: number;
  order: string[];
  currentTurnIndex: number;
  phaseStartedAt: number;
  phaseEndsAt: number;
  roulettePool?: string[];
  rouletteSelectedId?: string;
  pausedAt?: number;
  pausedRemainingMs?: number;
  readyUserIds?: string[];
  eliminatedUserIds?: string[];
  finalGuessesByUserId?: Record<string, string>;
  matchHistoryRecordedAt?: number;
  returnedToLobbyUserIds?: string[];
  skipVotes?: {
    phaseKey: string;
    userIds: string[];
  };
  sharedClueIds?: Record<string, string[]>;
  sharedClue?: {
    id: string;
    actorId: string;
    actorNickname: string;
    clueText: string;
    clueNumber: number;
    clueId?: string;
    autoShared?: boolean;
    autoSharedFalse?: boolean;
    createdAt: number;
  };
};

const ROULETTE_MS = 3_000;
const DISCONNECTED_USER_TIMEOUT_MS = 2 * 60 * 1000;
const ROOM_NICKNAME_MAX_LENGTH = 18;
const CUSTOM_ROOM_MAX_USERS = 10;

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  timersEnabled: true,
  readingTimeSeconds: 120,
  clueSelectionTimeSeconds: 10,
  revealedClueAnalysisTimeSeconds: 30,
  roundAnalysisTimeSeconds: 60,
  finalGuessTimeSeconds: 60,
  trueCluesPerPlayer: 50,
  cluesPerPlayer: 6,
};

const ROOM_CONFIG_LIMITS = {
  readingTimeSeconds: { min: 0, max: 300 },
  clueSelectionTimeSeconds: { min: 5, max: 60 },
  revealedClueAnalysisTimeSeconds: { min: 10, max: 120 },
  roundAnalysisTimeSeconds: { min: 0, max: 180 },
  finalGuessTimeSeconds: { min: 30, max: 120 },
  trueCluesPerPlayer: { min: 0, max: 100 },
  cluesPerPlayer: { min: 1, max: 10 },
} satisfies Record<Exclude<keyof RoomConfig, "timersEnabled">, { min: number; max: number }>;

let schemaReady: Promise<void> | null = null;

function normalizeUsers(users: unknown): RoomUser[] {
  if (!Array.isArray(users)) {
    return [];
  }

  return users.map((user) => {
    const partial = user as Partial<RoomUser> & { color?: string };
    const nickname =
      typeof partial.nickname === "string" && partial.nickname.trim()
        ? toRoomNickname(partial.nickname)
        : null;
    const accountUserId =
      typeof partial.accountUserId === "string" && partial.accountUserId.trim()
        ? partial.accountUserId.trim()
        : null;
    const color =
      typeof partial.color === "string" && isPlayerColor(partial.color)
        ? normalizePlayerColor(partial.color)
        : null;
    const joinedAt =
      typeof partial.joinedAt === "number" ? partial.joinedAt : Date.now();

    return {
      id: String(partial.id ?? crypto.randomUUID()),
      accountUserId,
      browserId: String(
        (partial as Partial<RoomUser> & { browserId?: unknown }).browserId ??
          partial.id ??
          crypto.randomUUID(),
      ),
      nickname,
      color,
      ready: Boolean(partial.ready) && Boolean(nickname && color),
      joinedAt,
      lastSeenAt:
        typeof partial.lastSeenAt === "number" ? partial.lastSeenAt : joinedAt,
    };
  });
}

export function toRoomNickname(nickname: string) {
  return nickname.trim().slice(0, ROOM_NICKNAME_MAX_LENGTH);
}

function assertRoomNicknameAllowed(nickname: string) {
  const result = validateDisplayNamePolicy(nickname);

  if (!result.ok) {
    throw new PublicError(result.message);
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfigNumber(
  value: unknown,
  key: Exclude<keyof RoomConfig, "timersEnabled">,
): number {
  const limits = ROOM_CONFIG_LIMITS[key];
  const numericValue = typeof value === "number" ? value : Number(value);
  const fallback = DEFAULT_ROOM_CONFIG[key];

  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return clampNumber(Math.round(numericValue), limits.min, limits.max);
}

function normalizeRoomConfig(value: unknown): RoomConfig {
  const data = value as Partial<RoomConfig> & Record<string, unknown>;

  return {
    timersEnabled:
      typeof data.timersEnabled === "boolean"
        ? data.timersEnabled
        : typeof data.timers_enabled === "boolean"
          ? data.timers_enabled
          : DEFAULT_ROOM_CONFIG.timersEnabled,
    readingTimeSeconds: normalizeConfigNumber(
      data.readingTimeSeconds ?? data.reading_time_seconds,
      "readingTimeSeconds",
    ),
    clueSelectionTimeSeconds: normalizeConfigNumber(
      data.clueSelectionTimeSeconds ?? data.clue_selection_time_seconds,
      "clueSelectionTimeSeconds",
    ),
    revealedClueAnalysisTimeSeconds: normalizeConfigNumber(
      data.revealedClueAnalysisTimeSeconds ??
        data.revealed_clue_analysis_time_seconds,
      "revealedClueAnalysisTimeSeconds",
    ),
    roundAnalysisTimeSeconds: normalizeConfigNumber(
      data.roundAnalysisTimeSeconds ?? data.round_analysis_time_seconds,
      "roundAnalysisTimeSeconds",
    ),
    finalGuessTimeSeconds: normalizeConfigNumber(
      data.finalGuessTimeSeconds ?? data.final_guess_time_seconds,
      "finalGuessTimeSeconds",
    ),
    cluesPerPlayer: normalizeConfigNumber(
      data.cluesPerPlayer ?? data.clues_per_player,
      "cluesPerPlayer",
    ),
    trueCluesPerPlayer: normalizeConfigNumber(
      data.trueCluesPerPlayer ??
        data.true_clues_per_player ??
        data.trueCluePercentage ??
        data.true_clue_percentage,
      "trueCluesPerPlayer",
    ),
  };
}

function getTrueCluePercentageStepCount(playerCount: number, cluesPerPlayer: number) {
  return Math.max(1, Math.max(1, playerCount) * Math.max(1, cluesPerPlayer));
}

function snapTrueCluePercentage({
  cluesPerPlayer,
  playerCount,
  percentage,
}: {
  cluesPerPlayer: number;
  percentage: number;
  playerCount: number;
}) {
  const stepCount = getTrueCluePercentageStepCount(playerCount, cluesPerPlayer);
  const stepIndex = Math.min(
    stepCount,
    Math.max(3, Math.round((percentage / 100) * stepCount)),
  );

  return Math.round((stepIndex * 100) / stepCount);
}

function applyRoomClueMinimums(config: RoomConfig, playerCount: number): RoomConfig {
  const cluesPerPlayer = Math.max(
    getMinimumCluesPerPlayer(playerCount),
    config.cluesPerPlayer,
  );

  return {
    ...config,
    cluesPerPlayer,
    trueCluesPerPlayer: snapTrueCluePercentage({
      cluesPerPlayer,
      percentage: config.trueCluesPerPlayer,
      playerCount,
    }),
  };
}

function durationMs(seconds: number) {
  return seconds * 1000;
}

function hasPhaseTimer(state: GameState, config: RoomConfig) {
  return config.timersEnabled || state.phase === "roulette";
}

function isPhaseExpired(state: GameState, now: number, config: RoomConfig) {
  return hasPhaseTimer(state, config) && now >= state.phaseEndsAt;
}

function publicRoom(room: Room) {
  const config = applyRoomClueMinimums(
    room.config ?? DEFAULT_ROOM_CONFIG,
    room.users.length,
  );
  const allReady = areAllRoomUsersReady(room.users);

  return {
    code: room.code,
    mode: room.mode ?? "custom",
    users: room.users,
    userCount: room.users.length,
    activecase: room.activecase,
    selectedcase: room.selectedcase ?? null,
    caseSelectionMode: room.caseSelectionMode ?? "generate",
    activeevent: room.activeevent,
    gamestate: room.gamestate,
    config,
    allReady,
  };
}

export function getRoomUserByAccountId(room: Room, accountUserId: string) {
  return normalizeUsers(room.users).find(
    (user) => user.accountUserId === accountUserId,
  ) ?? null;
}

export function publicRoomPreview(room: Room) {
  const users = normalizeUsers(room.users);
  const reachedCustomLimit =
    (room.mode ?? "custom") === "custom" && users.length >= CUSTOM_ROOM_MAX_USERS;
  const canJoin = isRoomAcceptingNewUsers(room, users) && !reachedCustomLimit;

  return {
    code: room.code,
    mode: room.mode ?? "custom",
    userCount: users.length,
    canJoin,
    joinBlockedReason: canJoin
      ? null
      : reachedCustomLimit
        ? "Salas personalizadas aceitam até 10 participantes."
        : "A sala está no meio de uma sessão. Aguarde o jogo terminar para entrar.",
  };
}

function hasCompleteProfile(user: RoomUser) {
  return Boolean(user.nickname && user.color);
}

function areAllRoomUsersReady(users: RoomUser[]) {
  return (
    users.length > 0 &&
    users.every((user) => hasCompleteProfile(user) && user.ready)
  );
}

function displayUserName(user: RoomUser) {
  return user.nickname ?? "Investigador sem identificação";
}

function isUserDisconnected(user: RoomUser, now: number) {
  return now - user.lastSeenAt > DISCONNECTED_USER_TIMEOUT_MS;
}

function normalizeBrowserId(browserId: string | undefined) {
  const trimmed = browserId?.trim();

  return trimmed && trimmed.length <= 80 ? trimmed : crypto.randomUUID();
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededShuffle<T>(items: T[], seedValue: string) {
  const shuffled = [...items];
  let seed = hashString(seedValue);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const swapIndex = seed % (index + 1);
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

function normalizeGameState(value: unknown): GameState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Partial<GameState>;

  if (
    state.phase !== "ready" &&
    state.phase !== "reading" &&
    state.phase !== "roulette" &&
    state.phase !== "turn" &&
    state.phase !== "shared_clue" &&
    state.phase !== "pause"
  ) {
    return null;
  }

  return {
    matchId: typeof state.matchId === "string" ? state.matchId : undefined,
    phase: state.phase,
    round: typeof state.round === "number" ? state.round : 1,
    order: Array.isArray(state.order) ? state.order.map(String) : [],
    currentTurnIndex:
      typeof state.currentTurnIndex === "number" ? state.currentTurnIndex : 0,
    phaseStartedAt:
      typeof state.phaseStartedAt === "number" ? state.phaseStartedAt : Date.now(),
    phaseEndsAt:
      typeof state.phaseEndsAt === "number" ? state.phaseEndsAt : Date.now(),
    roulettePool: Array.isArray(state.roulettePool)
      ? state.roulettePool.map(String)
      : undefined,
    rouletteSelectedId:
      typeof state.rouletteSelectedId === "string"
        ? state.rouletteSelectedId
        : undefined,
    pausedAt: typeof state.pausedAt === "number" ? state.pausedAt : undefined,
    pausedRemainingMs:
      typeof state.pausedRemainingMs === "number"
        ? state.pausedRemainingMs
        : undefined,
    readyUserIds: Array.isArray(state.readyUserIds)
      ? state.readyUserIds.map(String)
      : [],
    eliminatedUserIds: Array.isArray(state.eliminatedUserIds)
      ? state.eliminatedUserIds.map(String)
      : [],
    finalGuessesByUserId:
      state.finalGuessesByUserId && typeof state.finalGuessesByUserId === "object"
        ? Object.fromEntries(
            Object.entries(state.finalGuessesByUserId)
              .filter(([, guess]) => typeof guess === "string")
              .map(([id, guess]) => [id, String(guess)]),
          )
        : {},
    matchHistoryRecordedAt:
      typeof state.matchHistoryRecordedAt === "number"
        ? state.matchHistoryRecordedAt
        : undefined,
    returnedToLobbyUserIds: Array.isArray(state.returnedToLobbyUserIds)
      ? state.returnedToLobbyUserIds.map(String)
      : [],
    skipVotes:
      state.skipVotes && typeof state.skipVotes === "object"
        ? {
            phaseKey: String(state.skipVotes.phaseKey ?? ""),
            userIds: Array.isArray(state.skipVotes.userIds)
              ? state.skipVotes.userIds.map(String)
              : [],
          }
        : undefined,
    sharedClueIds:
      state.sharedClueIds && typeof state.sharedClueIds === "object"
        ? Object.fromEntries(
            Object.entries(state.sharedClueIds).map(([id, clues]) => [
              id,
              Array.isArray(clues) ? clues.map(String) : [],
            ]),
          )
        : {},
    sharedClue: state.sharedClue,
  };
}

function reconcileOrder(order: string[], users: RoomUser[], seed: string) {
  const userIds = users.map((user) => user.id);
  const kept = order.filter((id) => userIds.includes(id));
  const missing = userIds.filter((id) => !kept.includes(id));

  return [...kept, ...seededShuffle(missing, seed)];
}

function initialGameState(room: Room, now: number): GameState | null {
  if (!room.activecase || !room.users.length) {
    return null;
  }

  return {
    matchId: crypto.randomUUID(),
    phase: "ready",
    round: 1,
    order: [],
    currentTurnIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now,
    readyUserIds: [],
    eliminatedUserIds: [],
    returnedToLobbyUserIds: [],
    sharedClueIds: {},
  };
}

function startReadingPhase(state: GameState, now: number, config: RoomConfig) {
  return {
    ...state,
    phase: "reading",
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.readingTimeSeconds),
    skipVotes: undefined,
    sharedClue: undefined,
  } satisfies GameState;
}

function areAllUsersReady(userIds: string[], readyUserIds: string[]) {
  return userIds.length > 0 && userIds.every((id) => readyUserIds.includes(id));
}

function phaseSkipKey(state: GameState) {
  return `${state.phase}:${state.round}:${state.currentTurnIndex}:${state.phaseStartedAt}`;
}

function getActiveUsers(state: GameState, users: RoomUser[]) {
  const eliminated = new Set(state.eliminatedUserIds ?? []);

  return users.filter((user) => hasCompleteProfile(user) && !eliminated.has(user.id));
}

function addEliminatedUser(state: GameState, userId: string) {
  return Array.from(new Set([...(state.eliminatedUserIds ?? []), userId]));
}

function recordFinalGuessForUser(state: GameState, userId: string, guess: string) {
  return {
    ...state,
    finalGuessesByUserId: {
      ...(state.finalGuessesByUserId ?? {}),
      [userId]: guess.trim(),
    },
  } satisfies GameState;
}

function startRouletteSpin(
  state: GameState,
  users: RoomUser[],
  now: number,
  seed: string,
) {
  const userIds = users.map((user) => user.id);
  const existingOrder = state.order.filter((id) => userIds.includes(id));
  const pool =
    state.roulettePool?.filter((id) => userIds.includes(id)) ??
    userIds.filter((id) => !existingOrder.includes(id));
  const selectedId =
    pool.length === 1
      ? pool[0]
      : seededShuffle(pool, `${seed}:${existingOrder.length}:${state.round}`)[0];

  return {
    ...state,
    phase: "roulette",
    order: existingOrder,
    roulettePool: pool,
    rouletteSelectedId: selectedId,
    phaseStartedAt: now,
    phaseEndsAt: now + ROULETTE_MS,
    sharedClue: undefined,
  } satisfies GameState;
}

function finishRouletteSpin(
  state: GameState,
  users: RoomUser[],
  now: number,
  seed: string,
  config: RoomConfig,
) {
  const selectedId = state.rouletteSelectedId;
  const nextOrder = selectedId
    ? [...state.order.filter((id) => id !== selectedId), selectedId]
    : state.order;
  const nextPool = (state.roulettePool ?? [])
    .filter((id) => users.some((user) => user.id === id))
    .filter((id) => id !== selectedId);

  const finalOrder =
    nextPool.length === 1 ? [...nextOrder, nextPool[0]] : nextOrder;

  if (nextPool.length > 1) {
    return startRouletteSpin(
      {
        ...state,
        order: nextOrder,
        roulettePool: nextPool,
        rouletteSelectedId: undefined,
      },
      users,
      now,
      seed,
    );
  }

  return {
    ...state,
    phase: "turn",
    order: reconcileOrder(finalOrder, users, `${seed}:final`),
    roulettePool: undefined,
    rouletteSelectedId: undefined,
    currentTurnIndex: 0,
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.clueSelectionTimeSeconds),
    sharedClue: undefined,
  } satisfies GameState;
}

function getDistributedPlayerClues({
  caseId,
  falseClues,
  trueClues,
  userIndex,
  playerCount,
}: {
  caseId: string;
  falseClues: string[];
  trueClues: string[];
  userIndex: number;
  playerCount: number;
}) {
  if (playerCount <= 0) {
    return [];
  }

  const trueItems = trueClues.map((text, index) => ({
    id: `true-${index}`,
    text,
    isFalse: false,
  }));
  const falseItems = falseClues.map((text, index) => ({
    id: `false-${index}`,
    text,
    isFalse: true,
  }));
  const totalClues = trueItems.length + falseItems.length;
  const cluesPerPlayer = Math.floor(totalClues / playerCount);
  const usableClueCount = cluesPerPlayer * playerCount;
  const discardCount = totalClues - usableClueCount;
  const falseDiscardCount = Math.min(discardCount, falseItems.length);
  const trueDiscardCount = discardCount - falseDiscardCount;
  const keptFalseItems = falseItems.slice(0, falseItems.length - falseDiscardCount);
  const keptTrueItems = trueItems.slice(0, trueItems.length - trueDiscardCount);
  const distributed = seededShuffle(
    [...keptTrueItems, ...keptFalseItems],
    `${caseId}:distributed-clues:${playerCount}`,
  );

  return distributed
    .slice(userIndex * cluesPerPlayer, (userIndex + 1) * cluesPerPlayer)
    .map((clue, index) => ({ ...clue, number: index + 1 }));
}

function getSharedClueIds(state: GameState, userId: string) {
  return state.sharedClueIds?.[userId] ?? [];
}

function markClueShared(state: GameState, userId: string, clueId: string) {
  const existing = getSharedClueIds(state, userId);

  return {
    ...state.sharedClueIds,
    [userId]: existing.includes(clueId) ? existing : [...existing, clueId],
  };
}

function hasSharedEveryClueInCycle({
  clueCountPerPlayer,
  state,
  users,
}: {
  clueCountPerPlayer: number;
  state: GameState;
  users: RoomUser[];
}) {
  if (clueCountPerPlayer <= 0 || users.length === 0) {
    return false;
  }

  return users.every(
    (user) => getSharedClueIds(state, user.id).length >= clueCountPerPlayer,
  );
}

function resetSharedClueCycleIfComplete({
  clueCountPerPlayer,
  state,
  users,
}: {
  clueCountPerPlayer: number;
  state: GameState;
  users: RoomUser[];
}) {
  return hasSharedEveryClueInCycle({ clueCountPerPlayer, state, users })
    ? { ...state, sharedClueIds: {} }
    : state;
}

function normalizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

async function getCaseTrueClues(caseId: string, client?: DatabaseClient) {
  const executor = client ?? { query: dbQuery };
  const result = await executor.query<{
    true_clues: unknown;
    false_clues: unknown;
  }>(
    `SELECT true_clues, false_clues FROM cases WHERE id = $1::uuid`,
    [caseId],
  );

  return {
    trueClues: normalizeTextArray(result.rows[0]?.true_clues),
    falseClues: normalizeTextArray(result.rows[0]?.false_clues),
  };
}

async function getCaseClueCount(caseId: string, client?: DatabaseClient) {
  const executor = client ?? { query: dbQuery };
  const result = await executor.query<{
    total_count: number | string;
  }>(
    `
      SELECT
        jsonb_array_length(true_clues) + jsonb_array_length(false_clues) AS total_count
      FROM cases
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [caseId],
  );

  return Number(result.rows[0]?.total_count ?? 0) || 0;
}

async function getRandomCaseWithAtLeastClues(
  playerCount: number,
  client?: DatabaseClient,
) {
  const executor = client ?? { query: dbQuery };
  const result = await executor.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM cases
      WHERE jsonb_array_length(true_clues) + jsonb_array_length(false_clues) >= $1
      ORDER BY random()
      LIMIT 1
    `,
    [playerCount],
  );

  return result.rows[0]?.id ?? null;
}

async function buildAutoSharedClueState({
  state,
  users,
  caseId,
  config,
  now,
  client,
}: {
  state: GameState;
  users: RoomUser[];
  caseId: string | null;
  config: RoomConfig;
  now: number;
  client?: DatabaseClient;
}) {
  if (state.phase !== "turn" || state.pausedAt || !caseId) {
    return null;
  }

  const actorId = state.order[state.currentTurnIndex];
  const actor = users.find((user) => user.id === actorId);
  const actorIndex = users.findIndex((user) => user.id === actorId);

  if (!actor || actorIndex < 0) {
    return null;
  }

  const { trueClues, falseClues } = await getCaseTrueClues(caseId, client);
  const actorClues = getDistributedPlayerClues({
    caseId,
    falseClues,
    trueClues,
    userIndex: actorIndex,
    playerCount: users.length,
  });
  const usedIds = getSharedClueIds(state, actor.id);
  const availableClues = actorClues.filter((item) => !usedIds.includes(item.id));
  const clue = seededShuffle(
    availableClues,
    `${caseId}:${actor.id}:auto-share:${state.round}:${state.currentTurnIndex}:${now}`,
  )[0];

  if (!clue) {
    return null;
  }

  return {
    ...state,
    phase: "shared_clue",
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.revealedClueAnalysisTimeSeconds),
    sharedClueIds: markClueShared(state, actor.id, clue.id),
    sharedClue: {
      id: crypto.randomUUID(),
      actorId: actor.id,
      actorNickname: displayUserName(actor),
      clueText: clue.text,
      clueNumber: clue.number,
      clueId: clue.id,
      createdAt: now,
    },
  } satisfies GameState;
}

async function advanceGameStateWithAutoShare({
  state,
  users,
  now,
  seed,
  config,
  caseId,
  client,
  forceAdvance = false,
  clueCountPerPlayer = 0,
}: {
  state: GameState;
  users: RoomUser[];
  now: number;
  seed: string;
  config: RoomConfig;
  caseId: string | null;
  client?: DatabaseClient;
  forceAdvance?: boolean;
  clueCountPerPlayer?: number;
}) {
  const effectiveClueCountPerPlayer =
    clueCountPerPlayer > 0
      ? clueCountPerPlayer
      : state.phase === "pause" && caseId && users.length > 0
        ? Math.floor((await getCaseClueCount(caseId, client)) / users.length)
        : 0;

  if (
    state.phase === "turn" &&
    !state.pausedAt &&
    (forceAdvance || isPhaseExpired(state, now, config))
  ) {
    const autoShared = await buildAutoSharedClueState({
      state,
      users,
      caseId,
      config,
      now,
      client,
    });

    if (autoShared) {
      return autoShared;
    }
  }

  return advanceGameState(
    state,
    users,
    now,
    seed,
    config,
    forceAdvance,
    effectiveClueCountPerPlayer,
  );
}

function nextTurnOrPause(
  state: GameState,
  users: RoomUser[],
  now: number,
  config: RoomConfig,
) {
  if (state.currentTurnIndex + 1 >= state.order.length) {
    return {
      ...state,
      phase: "pause",
      phaseStartedAt: now,
      phaseEndsAt: now + durationMs(config.roundAnalysisTimeSeconds),
      sharedClue: undefined,
    } satisfies GameState;
  }

  return {
    ...state,
    phase: "turn",
    currentTurnIndex: state.currentTurnIndex + 1,
    phaseStartedAt: now,
    phaseEndsAt: now + durationMs(config.clueSelectionTimeSeconds),
    sharedClue: undefined,
    order: reconcileOrder(state.order, users, `${state.round}:turn`),
  } satisfies GameState;
}

function advanceGameState(
  state: GameState,
  users: RoomUser[],
  now: number,
  seed = "game",
  config = DEFAULT_ROOM_CONFIG,
  forceAdvance = false,
  clueCountPerPlayer = 0,
) {
  const activeUsers = getActiveUsers(state, users);
  const activeUserIds = activeUsers.map((user) => user.id);
  const order =
    state.phase === "ready" || state.phase === "reading" || state.phase === "roulette"
      ? state.order.filter((id) => activeUserIds.includes(id))
      : reconcileOrder(state.order, activeUsers, `${state.round}:order`);
  let next = {
    ...state,
    order,
  };
  let guard = 0;

  if (next.pausedAt || next.phase === "ready") {
    return next;
  }

  while ((forceAdvance || isPhaseExpired(next, now, config)) && guard < 20) {
    guard += 1;
    forceAdvance = false;

    if (next.phase === "reading") {
      next = startRouletteSpin(next, activeUsers, now, seed);
    } else if (next.phase === "roulette") {
      next = finishRouletteSpin(next, activeUsers, now, seed, config);
    } else if (next.phase === "turn" || next.phase === "shared_clue") {
      next = nextTurnOrPause(next, activeUsers, now, config);
    } else {
      const cycleState = resetSharedClueCycleIfComplete({
        clueCountPerPlayer,
        state: next,
        users: activeUsers,
      });

      next = {
        ...cycleState,
        phase: "turn",
        round: next.round + 1,
        currentTurnIndex: 0,
        phaseStartedAt: now,
        phaseEndsAt: now + durationMs(config.clueSelectionTimeSeconds),
        sharedClue: undefined,
      };
    }
  }

  return next;
}

function ensureColorAvailable({
  users,
  color,
  currentUserId,
}: {
  users: RoomUser[];
  color: PlayerColor;
  currentUserId?: string;
}) {
  const colorInUse = users.some(
    (user) => user.color === color && user.id !== currentUserId,
  );

  if (colorInUse) {
    throw new PublicError("Essa cor já está em uso na sala.");
  }
}

function isRoomAcceptingNewUsers(room: Room, users: RoomUser[]) {
  if (room.activecase) {
    return false;
  }

  const identifiedUsers = users.filter(hasCompleteProfile);

  return !(
    identifiedUsers.length > 0 &&
    identifiedUsers.length === users.length &&
    identifiedUsers.every((user) => user.ready)
  );
}

export async function ensureRoomsSchema() {
  schemaReady ??= dbQuery(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS game_rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_code text NOT NULL UNIQUE,
        activecase uuid,
        selectedcase uuid,
        case_selection_mode text NOT NULL DEFAULT 'generate',
        activeevent jsonb,
        gamestate jsonb,
        users jsonb NOT NULL DEFAULT '[]'::jsonb,
        mode text NOT NULL DEFAULT 'custom',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS game_rooms_config (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid UNIQUE REFERENCES game_rooms(id) ON DELETE CASCADE,
        timers_enabled boolean NOT NULL DEFAULT true,
        reading_time_seconds integer NOT NULL DEFAULT 120 CHECK (reading_time_seconds BETWEEN 0 AND 300),
        clue_selection_time_seconds integer NOT NULL DEFAULT 10 CHECK (clue_selection_time_seconds BETWEEN 5 AND 60),
        revealed_clue_analysis_time_seconds integer NOT NULL DEFAULT 30 CHECK (revealed_clue_analysis_time_seconds BETWEEN 10 AND 120),
        round_analysis_time_seconds integer NOT NULL DEFAULT 60 CHECK (round_analysis_time_seconds BETWEEN 0 AND 180),
        final_guess_time_seconds integer NOT NULL DEFAULT 60 CHECK (final_guess_time_seconds BETWEEN 30 AND 120),
        true_clues_per_player integer NOT NULL DEFAULT 50 CHECK (true_clues_per_player BETWEEN 0 AND 100),
        clues_per_player integer NOT NULL DEFAULT 6 CHECK (clues_per_player BETWEEN 1 AND 10),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE game_rooms
        ADD COLUMN IF NOT EXISTS room_code text,
        ADD COLUMN IF NOT EXISTS activecase uuid,
        ADD COLUMN IF NOT EXISTS selectedcase uuid,
        ADD COLUMN IF NOT EXISTS case_selection_mode text NOT NULL DEFAULT 'generate',
        ADD COLUMN IF NOT EXISTS activeevent jsonb,
        ADD COLUMN IF NOT EXISTS gamestate jsonb,
        ADD COLUMN IF NOT EXISTS users jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'custom',
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS config_id uuid;

      UPDATE game_rooms
      SET case_selection_mode = 'manual'
      WHERE selectedcase IS NOT NULL
        AND case_selection_mode = 'generate';

      UPDATE game_rooms
      SET case_selection_mode = 'generate',
          selectedcase = NULL
      WHERE case_selection_mode NOT IN ('generate', 'manual', 'automatic');

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'game_rooms_config_id_fkey'
        ) THEN
          ALTER TABLE game_rooms
            ADD CONSTRAINT game_rooms_config_id_fkey
            FOREIGN KEY (config_id) REFERENCES game_rooms_config(id) ON DELETE SET NULL;
        END IF;
      END $$;

      ALTER TABLE game_rooms_config
        ADD COLUMN IF NOT EXISTS timers_enabled boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS reading_time_seconds integer NOT NULL DEFAULT 120 CHECK (reading_time_seconds BETWEEN 0 AND 300),
        ADD COLUMN IF NOT EXISTS clue_selection_time_seconds integer NOT NULL DEFAULT 10 CHECK (clue_selection_time_seconds BETWEEN 5 AND 60),
        ADD COLUMN IF NOT EXISTS revealed_clue_analysis_time_seconds integer NOT NULL DEFAULT 30 CHECK (revealed_clue_analysis_time_seconds BETWEEN 10 AND 120),
        ADD COLUMN IF NOT EXISTS round_analysis_time_seconds integer NOT NULL DEFAULT 60 CHECK (round_analysis_time_seconds BETWEEN 0 AND 180),
        ADD COLUMN IF NOT EXISTS final_guess_time_seconds integer NOT NULL DEFAULT 60 CHECK (final_guess_time_seconds BETWEEN 30 AND 120),
        ADD COLUMN IF NOT EXISTS true_clues_per_player integer NOT NULL DEFAULT 50 CHECK (true_clues_per_player BETWEEN 0 AND 100),
        ADD COLUMN IF NOT EXISTS clues_per_player integer NOT NULL DEFAULT 6 CHECK (clues_per_player BETWEEN 1 AND 10),
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

      UPDATE game_rooms_config
      SET final_guess_time_seconds = 30
      WHERE final_guess_time_seconds < 30;

      UPDATE game_rooms_config
      SET final_guess_time_seconds = 120
      WHERE final_guess_time_seconds > 120;

      ALTER TABLE game_rooms_config
        DROP CONSTRAINT IF EXISTS game_rooms_config_final_guess_time_seconds_check,
        ADD CONSTRAINT game_rooms_config_final_guess_time_seconds_check
          CHECK (final_guess_time_seconds BETWEEN 30 AND 120);

      ALTER TABLE game_rooms_config
        DROP CONSTRAINT IF EXISTS game_rooms_config_true_clues_per_player_check;

      UPDATE game_rooms_config
      SET true_clues_per_player = LEAST(100, GREATEST(0, true_clues_per_player));

      ALTER TABLE game_rooms_config
        ADD CONSTRAINT game_rooms_config_true_clues_per_player_check
          CHECK (true_clues_per_player BETWEEN 0 AND 100);

      ALTER TABLE game_rooms_config
        DROP CONSTRAINT IF EXISTS game_rooms_config_clues_per_player_check,
        ADD CONSTRAINT game_rooms_config_clues_per_player_check
          CHECK (clues_per_player BETWEEN 1 AND 10);

      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'game_rooms_config'
            AND column_name = 'true_clue_percentage'
        ) THEN
          UPDATE game_rooms_config
          SET true_clues_per_player = LEAST(100, GREATEST(0, true_clue_percentage))
          WHERE true_clues_per_player = 50;
        END IF;
      END $$;

      INSERT INTO game_rooms_config (room_id)
      SELECT gr.id
      FROM game_rooms gr
      LEFT JOIN game_rooms_config cfg ON cfg.room_id = gr.id
      WHERE cfg.id IS NULL;

      UPDATE game_rooms gr
      SET config_id = cfg.id
      FROM game_rooms_config cfg
      WHERE cfg.room_id = gr.id
        AND gr.config_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS game_rooms_room_code_key
        ON game_rooms (room_code);
    `)
    .then(() => undefined)
    .catch((error) => {
      schemaReady = null;
      throw error;
    });

  return schemaReady;
}

async function ensureSchema() {
  return ensureRoomsSchema();
}

function removeDisconnectedUsersFromLobby(users: RoomUser[], now: number) {
  return users.filter((user) => !isUserDisconnected(user, now));
}

function eliminateUsersFromGame({
  code,
  users,
  state,
  activeevent,
  now,
  userIds,
  eventGuess,
  orderReason,
}: {
  code: string;
  users: RoomUser[];
  state: GameState | null;
  activeevent: RoomEvent | null;
  now: number;
  userIds: string[];
  eventGuess: string;
  orderReason: string;
}) {
  if (!state) {
    return { state, activeevent };
  }

  const userIdSet = new Set(userIds);
  const usersToEliminate = users.filter(
    (user) =>
      hasCompleteProfile(user) &&
      userIdSet.has(user.id) &&
      !(state.eliminatedUserIds ?? []).includes(user.id),
  );

  if (!usersToEliminate.length) {
    return { state, activeevent };
  }

  const eliminatedUserIds = Array.from(
    new Set([
      ...(state.eliminatedUserIds ?? []),
      ...usersToEliminate.map((user) => user.id),
    ]),
  );
  const nextStateBase = {
    ...state,
    eliminatedUserIds,
    readyUserIds: (state.readyUserIds ?? []).filter(
      (id) => !eliminatedUserIds.includes(id),
    ),
    skipVotes: state.skipVotes
      ? {
          ...state.skipVotes,
          userIds: state.skipVotes.userIds.filter(
            (id) => !eliminatedUserIds.includes(id),
          ),
        }
      : undefined,
    pausedAt: state.pausedAt,
    pausedRemainingMs: state.pausedRemainingMs,
  } satisfies GameState;
  const activeUsers = getActiveUsers(nextStateBase, users);
  const eliminatedUser = usersToEliminate[0];

  if (!activeUsers.length) {
    return {
      state: {
        ...nextStateBase,
        order: [],
        currentTurnIndex: 0,
        pausedAt: undefined,
        pausedRemainingMs: undefined,
        phaseStartedAt: now,
        phaseEndsAt: now,
      } satisfies GameState,
      activeevent: {
        id: crypto.randomUUID(),
        type: "solution_no_winner",
        actorId: eliminatedUser.id,
        actorNickname: displayUserName(eliminatedUser),
        guess: eventGuess,
        createdAt: now,
      } satisfies RoomEvent,
    };
  }

  const nextOrder = reconcileOrder(
    nextStateBase.order,
    activeUsers,
    `${code}:${orderReason}`,
  );
  const previousTurnUserId = state.order[state.currentTurnIndex];
  const preservedTurnIndex = nextOrder.indexOf(previousTurnUserId);
  const currentTurnIndex =
    preservedTurnIndex >= 0
      ? preservedTurnIndex
      : Math.min(nextStateBase.currentTurnIndex, Math.max(0, nextOrder.length - 1));
  const remainingMs = state.pausedAt
    ? state.pausedRemainingMs ?? 0
    : Math.max(0, state.phaseEndsAt - now);

  return {
    state: {
      ...nextStateBase,
      order: nextOrder,
      currentTurnIndex,
      pausedAt: undefined,
      pausedRemainingMs: undefined,
      phaseStartedAt: now,
      phaseEndsAt: now + remainingMs,
    } satisfies GameState,
    activeevent: {
      id: crypto.randomUUID(),
      type: "solution_wrong",
      actorId: eliminatedUser.id,
      actorNickname: displayUserName(eliminatedUser),
      guess: eventGuess,
      createdAt: now,
    } satisfies RoomEvent,
  };
}

function eliminateDisconnectedUsersFromGame({
  code,
  users,
  state,
  activeevent,
  now,
}: {
  code: string;
  users: RoomUser[];
  state: GameState | null;
  activeevent: RoomEvent | null;
  now: number;
}) {
  const staleUserIds = users
    .filter((user) => hasCompleteProfile(user) && isUserDisconnected(user, now))
    .map((user) => user.id);

  return eliminateUsersFromGame({
    code,
    users,
    state,
    activeevent,
    now,
    userIds: staleUserIds,
    eventGuess: "Desconexão por inatividade.",
    orderReason: "disconnected",
  });
}

async function sweepDisconnectedUsers(code: string, client?: DatabaseClient) {
  const executor = client ?? (await getDbClient());
  const ownsClient = !client;

  try {
    if (ownsClient) {
      await executor.query("BEGIN");
    }

    const current = await executor.query<Room>(
      `
        SELECT
          room_code AS code,
          mode,
          users,
          activecase::text AS activecase,
          selectedcase::text AS selectedcase,
          case_selection_mode AS "caseSelectionMode",
          activeevent,
          gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      if (ownsClient) {
        await executor.query("COMMIT");
      }
      return;
    }

    const now = Date.now();
    const users = normalizeUsers(room.users);
    let updatedUsers = users;
    let updatedState = normalizeGameState(room.gamestate);
    let updatedEvent = room.activeevent;
    let usersChanged = false;
    let stateChanged = false;
    let eventChanged = false;

    if (room.activecase) {
      const eliminatedUserIds = new Set(updatedState?.eliminatedUserIds ?? []);
      const disconnectedUserIds = users
        .filter((user) => isUserDisconnected(user, now))
        .map((user) => user.id);
      const disconnectedGameUserIds = users
        .filter(
          (user) =>
            updatedState &&
            hasCompleteProfile(user) &&
            isUserDisconnected(user, now) &&
            !eliminatedUserIds.has(user.id),
        )
        .map((user) => user.id);
      const eliminated = eliminateDisconnectedUsersFromGame({
        code,
        users,
        state: updatedState,
        activeevent: updatedEvent,
        now,
      });

      updatedState = eliminated.state;
      updatedEvent = eliminated.activeevent;
      stateChanged = disconnectedGameUserIds.length > 0;
      eventChanged = disconnectedGameUserIds.length > 0;

      if (disconnectedUserIds.length) {
        const disconnected = new Set(disconnectedUserIds);
        usersChanged = users.some(
          (user) => disconnected.has(user.id) && user.ready,
        );

        if (usersChanged) {
          updatedUsers = users.map((user) =>
            disconnected.has(user.id) ? { ...user, ready: false } : user,
          );
        }
      }
    } else {
      const wasCreatingCase = areAllRoomUsersReady(users);
      updatedUsers = removeDisconnectedUsersFromLobby(users, now);
      usersChanged = updatedUsers.length !== users.length;

      if (wasCreatingCase && usersChanged) {
        updatedUsers = updatedUsers.map((user) => ({ ...user, ready: false }));
        updatedState = null;
        updatedEvent = null;
        stateChanged = Boolean(room.gamestate);
        eventChanged = Boolean(room.activeevent);
      }
    }

    if (usersChanged || stateChanged || eventChanged) {
      if (
        updatedState &&
        updatedEvent &&
        (updatedEvent.type === "solution_correct" ||
          updatedEvent.type === "solution_no_winner")
      ) {
        updatedState = await recordEndedMatch({
          activecase: room.activecase,
          state: updatedState,
          users: updatedUsers,
          winnerRoomUserId:
            updatedEvent.type === "solution_correct" ? updatedEvent.actorId : null,
          winningFinalGuess:
            updatedEvent.type === "solution_correct"
              ? updatedEvent.guess ?? null
              : null,
          mode: room.mode ?? "custom",
          client: executor,
        });
      }

      if (!updatedUsers.length) {
        await executor.query(`DELETE FROM game_rooms WHERE room_code = $1`, [
          code,
        ]);
      } else {
        await executor.query(
          `
            UPDATE game_rooms
            SET users = $2::jsonb,
                gamestate = $3::jsonb,
                activeevent = $4::jsonb,
                updated_at = now()
            WHERE room_code = $1
          `,
          [
            code,
            JSON.stringify(updatedUsers),
            updatedState ? JSON.stringify(updatedState) : null,
            updatedEvent ? JSON.stringify(updatedEvent) : null,
          ],
        );
      }
    }

    if (ownsClient) {
      await executor.query("COMMIT");
    }
  } catch (error) {
    if (ownsClient) {
      await executor.query("ROLLBACK");
    }
    throw error;
  } finally {
    if (ownsClient && "release" in executor) {
      (executor as { release: () => void }).release();
    }
  }
}

export async function createRoom({
  accountUserId,
  browserId,
  nickname,
}: {
  accountUserId: string;
  browserId?: string;
  nickname: string;
}) {
  await ensureSchema();

  const trimmedNickname = toRoomNickname(nickname);

  if (!trimmedNickname) {
    throw new PublicError("Entre e escolha seu nome antes de criar sala.");
  }

  assertRoomNicknameAllowed(trimmedNickname);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const now = Date.now();
    const normalizedBrowserId = normalizeBrowserId(browserId);
    const user: RoomUser = {
      id: crypto.randomUUID(),
      accountUserId,
      browserId: normalizedBrowserId,
      nickname: trimmedNickname,
      color: null,
      ready: false,
      joinedAt: now,
      lastSeenAt: now,
    };
    const client = await getDbClient();

    try {
      await client.query("BEGIN");

      const result = await client.query<Room & { id: string }>(
        `
          INSERT INTO game_rooms (room_code, users, activecase)
          VALUES ($1, $2::jsonb, NULL)
          ON CONFLICT DO NOTHING
          RETURNING id::text AS id, room_code AS code, users, activecase::text AS activecase, activeevent, gamestate, mode
        `,
        [code, JSON.stringify([user])],
      );
      const room = result.rows[0];

      if (!room) {
        await client.query("ROLLBACK");
        continue;
      }

      const configResult = await client.query<RoomConfig & { id: string }>(
        `
          INSERT INTO game_rooms_config (room_id)
          VALUES ($1::uuid)
          RETURNING
            id::text AS id,
            reading_time_seconds AS "readingTimeSeconds",
            clue_selection_time_seconds AS "clueSelectionTimeSeconds",
            revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
            round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
            final_guess_time_seconds AS "finalGuessTimeSeconds",
            true_clues_per_player AS "trueCluesPerPlayer",
            clues_per_player AS "cluesPerPlayer",
            timers_enabled AS "timersEnabled"
        `,
        [room.id],
      );
      const config = normalizeRoomConfig(configResult.rows[0]);

      await client.query(
        `UPDATE game_rooms SET config_id = $2::uuid WHERE id = $1::uuid`,
        [room.id, configResult.rows[0].id],
      );
      await client.query("COMMIT");

      return {
        room: publicRoom({
          code: room.code,
          mode: room.mode,
          users: normalizeUsers(room.users),
          activecase: room.activecase,
          activeevent: room.activeevent,
          gamestate: normalizeGameState(room.gamestate),
          config,
        }),
        user,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  throw new Error("Não deu para criar uma sala agora.");
}

export async function getRoom(code: string) {
  await ensureSchema();
  await sweepDisconnectedUsers(code);

  const baseRoom = await readRoomSnapshot(code);

  if (!baseRoom) {
    return null;
  }

  const now = Date.now();
  const nextState = baseRoom.gamestate
    ? await advanceGameStateWithAutoShare({
        state: baseRoom.gamestate,
        users: baseRoom.users,
        now,
        seed: `${code}:${baseRoom.activecase ?? "case"}`,
        config: baseRoom.config,
        caseId: baseRoom.activecase,
      })
    : initialGameState(baseRoom, now);

  if (JSON.stringify(nextState) !== JSON.stringify(baseRoom.gamestate)) {
    await dbQuery(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, nextState ? JSON.stringify(nextState) : null],
    );
  }

  return publicRoom({
    ...baseRoom,
    gamestate: nextState,
  });
}

export async function getRoomSnapshot(code: string) {
  await ensureSchema();

  return readRoomSnapshot(code);
}

async function readRoomSnapshot(code: string) {
  const result = await dbQuery<Room>(
    `
      SELECT
        gr.room_code AS code,
        gr.mode,
        gr.users,
        gr.activecase::text AS activecase,
        gr.selectedcase::text AS selectedcase,
        gr.case_selection_mode AS "caseSelectionMode",
        gr.activeevent,
        gr.gamestate,
        cfg.reading_time_seconds AS "readingTimeSeconds",
        cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
        cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
        cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
        cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
        cfg.true_clues_per_player AS "trueCluesPerPlayer",
        cfg.clues_per_player AS "cluesPerPlayer",
        cfg.timers_enabled AS "timersEnabled"
      FROM game_rooms gr
      LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
      WHERE gr.room_code = $1
    `,
    [code],
  );
  const room = result.rows[0];

  if (!room) {
    return null;
  }

  const users = normalizeUsers(room.users);
  const config = normalizeRoomConfig(room);
  return publicRoom({
    code: room.code,
    mode: room.mode,
    users,
    activecase: room.activecase,
    selectedcase: room.selectedcase,
    caseSelectionMode: room.caseSelectionMode,
    activeevent: room.activeevent,
    gamestate: normalizeGameState(room.gamestate),
    config,
  });
}

export async function isRoomUserAuthorized({
  accountUserId,
  code,
  nickname,
  userId,
}: {
  accountUserId: string;
  code: string;
  nickname: string;
  userId: string;
}) {
  await ensureSchema();

  const result = await dbQuery<Pick<Room, "users">>(
    `
      SELECT users
      FROM game_rooms
      WHERE room_code = $1
    `,
    [code],
  );
  const users = normalizeUsers(result.rows[0]?.users);
  const normalizedNickname = toRoomNickname(nickname);

  return users.some((user) => {
    if (user.id !== userId) {
      return false;
    }

    if (user.accountUserId) {
      return user.accountUserId === accountUserId;
    }

    return user.nickname === normalizedNickname;
  });
}

export async function joinRoom({
  accountUserId,
  code,
  browserId,
  nickname,
}: {
  accountUserId: string;
  code: string;
  browserId?: string;
  nickname: string;
}) {
  await ensureSchema();

  const trimmedNickname = toRoomNickname(nickname);
  const normalizedBrowserId = normalizeBrowserId(browserId);

  if (!trimmedNickname) {
    throw new PublicError("Entre e escolha seu nome antes de entrar na sala.");
  }

  assertRoomNicknameAllowed(trimmedNickname);

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await sweepDisconnectedUsers(code, client);

    const current = await client.query<Room>(
      `
        SELECT
          room_code AS code,
          mode,
          users,
          activecase::text AS activecase,
          selectedcase::text AS selectedcase,
          case_selection_mode AS "caseSelectionMode",
          activeevent,
          gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const existingUser = users.find(
      (user) => user.browserId === normalizedBrowserId,
    );

    if (existingUser) {
      const updatedUsers = users.map((user) =>
        user.id === existingUser.id
          ? {
              ...user,
              accountUserId: user.accountUserId ?? accountUserId,
              lastSeenAt: Date.now(),
            }
          : user,
      );

      await client.query(
        `
          UPDATE game_rooms
          SET users = $2::jsonb,
              updated_at = now()
          WHERE room_code = $1
        `,
        [code, JSON.stringify(updatedUsers)],
      );

      await client.query("COMMIT");

      const updatedUser =
        updatedUsers.find((user) => user.id === existingUser.id) ?? existingUser;

      return {
        room: publicRoom({
          code,
          mode: room.mode,
          users: updatedUsers,
          activecase: room.activecase,
          selectedcase: room.selectedcase,
          caseSelectionMode: room.caseSelectionMode,
          activeevent: room.activeevent,
          gamestate: normalizeGameState(room.gamestate),
        }),
        user: updatedUser,
      };
    }

    if (!isRoomAcceptingNewUsers(room, users)) {
      await client.query("ROLLBACK");
      throw new PublicError("A sala está no meio de uma sessão. Aguarde o jogo terminar para entrar.");
    }

    if ((room.mode ?? "custom") === "custom" && users.length >= CUSTOM_ROOM_MAX_USERS) {
      await client.query("ROLLBACK");
      throw new PublicError("Salas personalizadas aceitam até 10 participantes.");
    }

    const now = Date.now();

    const user: RoomUser = {
      id: crypto.randomUUID(),
      accountUserId,
      browserId: normalizedBrowserId,
      nickname: trimmedNickname,
      color: null,
      ready: false,
      joinedAt: now,
      lastSeenAt: now,
    };
    const updatedUsers = [...users, user];

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return {
      room: publicRoom({
        code,
          mode: room.mode,
          users: updatedUsers,
          activecase: room.activecase,
          selectedcase: room.selectedcase,
          caseSelectionMode: room.caseSelectionMode,
          activeevent: room.activeevent,
          gamestate: normalizeGameState(room.gamestate),
      }),
      user,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function leaveRoom({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT
          room_code AS code,
          mode,
          users,
          activecase::text AS activecase,
          selectedcase::text AS selectedcase,
          case_selection_mode AS "caseSelectionMode",
          activeevent,
          gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const wasCreatingCase = !room.activecase && areAllRoomUsersReady(users);
    let updatedUsers = users.filter((user) => user.id !== userId);
    let updatedState = normalizeGameState(room.gamestate);
    let updatedEvent = room.activeevent;

    if (room.activecase) {
      const eliminated = eliminateUsersFromGame({
        code,
        users,
        state: updatedState,
        activeevent: updatedEvent,
        now: Date.now(),
        userIds: [userId],
        eventGuess: "Saiu da sala.",
        orderReason: "left",
      });

      updatedUsers = users.map((user) =>
        user.id === userId ? { ...user, ready: false } : user,
      );
      updatedState = eliminated.state;
      updatedEvent = eliminated.activeevent;
    } else if (wasCreatingCase && updatedUsers.length !== users.length) {
      updatedUsers = updatedUsers.map((user) => ({ ...user, ready: false }));
      updatedState = null;
      updatedEvent = null;
    }

    if (!updatedUsers.length) {
      await client.query(`DELETE FROM game_rooms WHERE room_code = $1`, [code]);
      await client.query("COMMIT");
      return null;
    }

    if (
      updatedState &&
      updatedEvent &&
      (updatedEvent.type === "solution_correct" ||
        updatedEvent.type === "solution_no_winner")
    ) {
      updatedState = await recordEndedMatch({
        activecase: room.activecase,
        state: updatedState,
        users: updatedUsers,
        winnerRoomUserId:
          updatedEvent.type === "solution_correct" ? updatedEvent.actorId : null,
        winningFinalGuess:
          updatedEvent.type === "solution_correct" ? updatedEvent.guess ?? null : null,
        mode: room.mode ?? "custom",
        client,
      });
    }

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            gamestate = $3::jsonb,
            activeevent = $4::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [
        code,
        JSON.stringify(updatedUsers),
        updatedState ? JSON.stringify(updatedState) : null,
        updatedEvent ? JSON.stringify(updatedEvent) : null,
      ],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      mode: room.mode,
      users: updatedUsers,
      activecase: room.activecase,
      activeevent: updatedEvent,
      gamestate: updatedState,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function leaveRoomsByAccountUserId(accountUserId: string) {
  await ensureSchema();

  const result = await dbQuery<{
    code: string;
    users: unknown;
  }>(
    `
      SELECT room_code AS code, users
      FROM game_rooms
      WHERE users @> $1::jsonb
      ORDER BY updated_at DESC
    `,
    [JSON.stringify([{ accountUserId }])],
  );

  const presences = result.rows.flatMap((room) =>
    normalizeUsers(room.users)
      .filter((user) => user.accountUserId === accountUserId)
      .map((user) => ({ code: room.code, userId: user.id })),
  );

  for (const presence of presences) {
    await leaveRoom(presence);
  }
}

export async function heartbeatRoomUser({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");
    await sweepDisconnectedUsers(code, client);

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, mode, users, activecase::text AS activecase, selectedcase::text AS selectedcase, case_selection_mode AS "caseSelectionMode", activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    let userExists = false;
    let accountUserId: string | null = null;
    const now = Date.now();
    const users = normalizeUsers(room.users).map((user) => {
      if (user.id !== userId) {
        return user;
      }

      userExists = true;
      accountUserId = user.accountUserId ?? null;
      return {
        ...user,
        lastSeenAt: now,
      };
    });

    if (!userExists) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(users)],
    );

    await client.query("COMMIT");

    if (accountUserId) {
      touchUserPresence(accountUserId).catch((error: unknown) => {
        console.warn("[friends][presence] heartbeat update failed", error);
      });
    }

    return publicRoom({
      code,
      mode: room.mode,
      users,
      activecase: room.activecase,
      selectedcase: room.selectedcase,
      caseSelectionMode: room.caseSelectionMode,
      activeevent: room.activeevent,
      gamestate: normalizeGameState(room.gamestate),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function kickRoomUser({
  code,
  leaderUserId,
  targetUserId,
}: {
  code: string;
  leaderUserId: string;
  targetUserId: string;
}) {
  await ensureSchema();

  if (leaderUserId === targetUserId) {
    throw new PublicError("Use sair da sala para deixar a mesa.");
  }

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT
          room_code AS code,
          mode,
          users,
          activecase::text AS activecase,
          selectedcase::text AS selectedcase,
          case_selection_mode AS "caseSelectionMode",
          activeevent,
          gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const leader = users[0];

    if ((room.mode ?? "custom") !== "custom") {
      throw new PublicError("Remoção disponível apenas em sala personalizada.");
    }

    if (room.activecase) {
      throw new PublicError("Não é possível remover jogadores depois da largada.");
    }

    if (!leader || leader.id !== leaderUserId) {
      throw new PublicError("Apenas o líder pode remover jogadores da sala.");
    }

    if (!users.some((user) => user.id === targetUserId)) {
      throw new PublicError("Jogador não encontrado na sala.", 404);
    }

    const updatedUsers = users
      .filter((user) => user.id !== targetUserId)
      .map((user) => ({ ...user, ready: false }));

    if (!updatedUsers.length) {
      await client.query(`DELETE FROM game_rooms WHERE room_code = $1`, [code]);
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            gamestate = NULL,
            activeevent = NULL,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      mode: room.mode,
      users: updatedUsers,
      activecase: room.activecase,
      selectedcase: room.selectedcase,
      caseSelectionMode: room.caseSelectionMode,
      activeevent: null,
      gamestate: null,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRoomUser({
  code,
  userId,
  color,
}: {
  code: string;
  userId: string;
  color: string;
}) {
  await ensureSchema();

  const normalizedColor = color.trim();
  const profileColor = isPlayerColor(normalizedColor)
    ? normalizePlayerColor(normalizedColor)
    : null;

  if (!profileColor) {
    throw new PublicError("Escolha uma cor válida.");
  }

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, mode, users, activecase::text AS activecase, selectedcase::text AS selectedcase, case_selection_mode AS "caseSelectionMode", activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    ensureColorAvailable({
      users,
      color: profileColor,
      currentUserId: userId,
    });

    let updatedUser: RoomUser | null = null;
    const updatedUsers = users.map((user) => {
      if (user.id !== userId) {
        return user;
      }

      updatedUser = {
        ...user,
        color: profileColor,
        ready: false,
        lastSeenAt: Date.now(),
      };

      return updatedUser;
    });

    if (!updatedUser) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return {
      room: publicRoom({
        code,
          mode: room.mode,
          users: updatedUsers,
          activecase: room.activecase,
          selectedcase: room.selectedcase,
          caseSelectionMode: room.caseSelectionMode,
          activeevent: room.activeevent,
        gamestate: normalizeGameState(room.gamestate),
      }),
      user: updatedUser,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateRoomConfig({
  code,
  userId,
  config,
}: {
  code: string;
  userId: string;
  config: Partial<RoomConfig>;
}) {
  await ensureSchema();

  const nextConfig = normalizeRoomConfig(config);
  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room & { config_id: string | null }>(
      `
        SELECT room_code AS code, mode, users, activecase::text AS activecase, selectedcase::text AS selectedcase, case_selection_mode AS "caseSelectionMode", activeevent, gamestate, config_id::text AS config_id
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    if (room.activecase) {
      await client.query("ROLLBACK");
      throw new PublicError("A mesa já está em jogo.");
    }

    if ((room.mode ?? "custom") !== "custom") {
      await client.query("ROLLBACK");
      throw new PublicError("Esta mesa usa regras clássicas.");
    }

    const users = normalizeUsers(room.users);
    const firstUser = users[0];

    if (!firstUser || firstUser.id !== userId) {
      await client.query("ROLLBACK");
      throw new PublicError("Apenas o líder pode alterar a mesa.");
    }

    let configId = room.config_id;

    if (!configId) {
      const configResult = await client.query<{ id: string }>(
        `
          INSERT INTO game_rooms_config (room_id)
          SELECT id FROM game_rooms WHERE room_code = $1
          ON CONFLICT (room_id) DO UPDATE SET updated_at = now()
          RETURNING id::text AS id
        `,
        [code],
      );
      configId = configResult.rows[0].id;
      await client.query(
        `UPDATE game_rooms SET config_id = $2::uuid WHERE room_code = $1`,
        [code, configId],
      );
    }

    const snappedConfig = applyRoomClueMinimums(nextConfig, users.length);
    const updatedUsers = users.map((user) => ({ ...user, ready: false }));

    await client.query(
      `
        UPDATE game_rooms_config
        SET timers_enabled = $2,
            reading_time_seconds = $3,
            clue_selection_time_seconds = $4,
            revealed_clue_analysis_time_seconds = $5,
            round_analysis_time_seconds = $6,
            final_guess_time_seconds = $7,
            true_clues_per_player = $8,
            clues_per_player = $9,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [
        configId,
        snappedConfig.timersEnabled,
        snappedConfig.readingTimeSeconds,
        snappedConfig.clueSelectionTimeSeconds,
        snappedConfig.revealedClueAnalysisTimeSeconds,
        snappedConfig.roundAnalysisTimeSeconds,
        snappedConfig.finalGuessTimeSeconds,
        snappedConfig.trueCluesPerPlayer,
        snappedConfig.cluesPerPlayer,
      ],
    );

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      mode: room.mode,
      users: updatedUsers,
      activecase: room.activecase,
      selectedcase: room.selectedcase,
      caseSelectionMode: room.caseSelectionMode,
      activeevent: room.activeevent,
      gamestate: normalizeGameState(room.gamestate),
      config: snappedConfig,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setRoomUserReady({
  code,
  userId,
  ready,
}: {
  code: string;
  userId: string;
  ready: boolean;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, mode, users, activecase::text AS activecase, selectedcase::text AS selectedcase, case_selection_mode AS "caseSelectionMode", activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    let userExists = false;
    const updatedUsers = normalizeUsers(room.users).map((user) => {
      if (user.id !== userId) {
        return user;
      }

      userExists = true;

      if (ready && !hasCompleteProfile(user)) {
        throw new PublicError("Escolha uma cor antes de marcar pronto.");
      }

      return {
        ...user,
        ready,
        lastSeenAt: Date.now(),
      };
    });

    if (!userExists) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    let nextUsers = updatedUsers;
    let activecase = room.activecase;
    let selectedcase = room.selectedcase ?? null;
    let caseSelectionMode = room.caseSelectionMode ?? "generate";
    const allUsersReady = areAllRoomUsersReady(nextUsers);
    const selectedCaseToStart =
      allUsersReady && caseSelectionMode === "manual" && selectedcase
        ? selectedcase
        : null;

    if (selectedCaseToStart) {
      const totalClues = await getCaseClueCount(selectedCaseToStart, client);

      if (totalClues < nextUsers.length) {
        nextUsers = nextUsers.map((user) => ({ ...user, ready: false }));
        selectedcase = null;
        caseSelectionMode = "generate";
      } else {
        activecase = selectedcase;
        selectedcase = null;
      }
    } else if (allUsersReady && caseSelectionMode === "automatic") {
      const randomCaseId = await getRandomCaseWithAtLeastClues(nextUsers.length, client);

      if (randomCaseId) {
        activecase = randomCaseId;
      } else {
        nextUsers = nextUsers.map((user) => ({ ...user, ready: false }));
      }
    }

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            activecase = $3::uuid,
            selectedcase = $4::uuid,
            case_selection_mode = $5,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(nextUsers), activecase, selectedcase, caseSelectionMode],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      mode: room.mode,
      users: nextUsers,
      activecase,
      selectedcase,
      caseSelectionMode,
      activeevent: room.activeevent,
      gamestate: normalizeGameState(room.gamestate),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setRoomActiveCase({
  code,
  caseId,
}: {
  code: string;
  caseId: string;
}) {
  await ensureSchema();

  const result = await dbQuery(
    `
      UPDATE game_rooms
      SET activecase = $2::uuid,
          selectedcase = NULL,
          updated_at = now()
      WHERE room_code = $1
        AND activecase IS NULL
        AND jsonb_array_length(users) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(users) AS user_data(value)
          WHERE COALESCE(user_data.value->'ready', 'false'::jsonb) <> 'true'::jsonb
             OR NULLIF(user_data.value->>'nickname', '') IS NULL
             OR NULLIF(user_data.value->>'color', '') IS NULL
        )
      RETURNING room_code
    `,
    [code, caseId],
  );

  return result.rowCount === 1;
}

export async function cancelCustomCaseCreation({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room & RoomConfig>(
      `
        SELECT
          gr.room_code AS code,
          gr.mode,
          gr.users,
          gr.activecase::text AS activecase,
          gr.selectedcase::text AS selectedcase,
          gr.case_selection_mode AS "caseSelectionMode",
          gr.activeevent,
          gr.gamestate,
          cfg.reading_time_seconds AS "readingTimeSeconds",
          cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
          cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
          cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
          cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
          cfg.true_clues_per_player AS "trueCluesPerPlayer",
          cfg.clues_per_player AS "cluesPerPlayer",
          cfg.timers_enabled AS "timersEnabled"
        FROM game_rooms gr
        LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
        WHERE gr.room_code = $1
        FOR UPDATE OF gr
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const requester = users.find((user) => user.id === userId);

    if (!requester) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    const config = normalizeRoomConfig(room);

    if ((room.mode ?? "custom") !== "custom") {
      await client.query("ROLLBACK");
      throw new PublicError("A criação só pode ser cancelada em sala personalizada.");
    }

    if (room.activecase) {
      await client.query("ROLLBACK");
      throw new PublicError("O caso já foi criado. Volte pela tela de jogo.");
    }

    const resetUsers = users.map((user) => ({ ...user, ready: false }));

    await client.query(
      `
        UPDATE game_rooms
        SET users = $2::jsonb,
            activeevent = NULL,
            gamestate = NULL,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(resetUsers)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      mode: room.mode,
      users: resetUsers,
      activecase: null,
      selectedcase: room.selectedcase,
      caseSelectionMode: room.caseSelectionMode,
      activeevent: null,
      gamestate: null,
      config,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function selectRoomCase({
  caseId,
  code,
  mode = caseId ? "manual" : "generate",
  userId,
}: {
  caseId: string | null;
  code: string;
  mode?: CaseSelectionMode;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT
          room_code AS code,
          mode,
          users,
          activecase::text AS activecase,
          selectedcase::text AS selectedcase,
          case_selection_mode AS "caseSelectionMode",
          activeevent,
          gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const leader = users[0];

    if (room.mode !== "custom") {
      throw new PublicError("A seleção de caso só está disponível em salas personalizadas.");
    }

    if (room.activecase) {
      throw new PublicError("Não é possível trocar o caso depois que o jogo começou.");
    }

    if (!leader || leader.id !== userId) {
      throw new PublicError("Apenas o primeiro participante pode escolher o caso da sala.");
    }

    if (!["generate", "manual", "automatic"].includes(mode)) {
      throw new PublicError("Modo de seleção de caso inválido.");
    }

    if (mode === "manual" && !caseId) {
      throw new PublicError("Escolha um caso para usar o modo manual.");
    }

    if (mode !== "manual" && caseId) {
      throw new PublicError("Apenas o modo manual pode vincular um caso específico.");
    }

    if (mode === "manual" && caseId) {
      const totalClues = await getCaseClueCount(caseId, client);

      if (totalClues < users.length) {
        throw new PublicError("Escolha um caso com ao menos uma pista por jogador.");
      }
    }

    const updatedUsers = users.map((user) => ({ ...user, ready: false }));
    const selectedCaseId = mode === "manual" ? caseId : null;

    await client.query(
      `
        UPDATE game_rooms
        SET selectedcase = $2::uuid,
            case_selection_mode = $3,
            users = $4::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, selectedCaseId, mode, JSON.stringify(updatedUsers)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      mode: room.mode,
      users: updatedUsers,
      activecase: room.activecase,
      selectedcase: selectedCaseId,
      caseSelectionMode: mode,
      activeevent: room.activeevent,
      gamestate: normalizeGameState(room.gamestate),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getCaseFinalAnswer(caseId: string, client?: DatabaseClient) {
  const executor = client ?? { query: dbQuery };
  const result = await executor.query<{ final_answer: string }>(
    `SELECT final_answer FROM cases WHERE id = $1::uuid`,
    [caseId],
  );

  return result.rows[0]?.final_answer ?? "";
}

async function recordEndedMatch({
  activecase,
  state,
  users,
  winnerRoomUserId,
  winningFinalGuess,
  mode,
  client,
}: {
  activecase: string | null;
  state: GameState;
  users: RoomUser[];
  winnerRoomUserId: string | null;
  winningFinalGuess: string | null;
  mode: RoomMode;
  client: DatabaseClient;
}) {
  if (!activecase || state.matchHistoryRecordedAt) {
    return state;
  }

  const finalAnswer = await getCaseFinalAnswer(activecase, client);

  return recordMatchHistory({
    caseId: activecase,
    finalAnswer,
    state,
    users,
    winnerRoomUserId,
    winningFinalGuess,
    mode,
    client,
  });
}

const MAX_FINAL_GUESS_JUDGE_ATTEMPTS = 3;

function parseAiBoolean(text: string): boolean | null {
  const normalized = text.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  try {
    const parsed = JSON.parse(text.trim()) as unknown;

    if (typeof parsed === "boolean") {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { correct?: unknown }).correct === "boolean"
    ) {
      return (parsed as { correct: boolean }).correct;
    }
  } catch {
    // Fall back to extracting a clear boolean token from prose.
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1)) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof (parsed as { correct?: unknown }).correct === "boolean"
      ) {
        return (parsed as { correct: boolean }).correct;
      }
    } catch {
      // Continue to token extraction.
    }
  }

  const matches = normalized.match(/\b(?:true|false)\b/g) ?? [];
  const uniqueMatches = Array.from(new Set(matches));

  if (uniqueMatches.length !== 1) {
    return null;
  }

  return uniqueMatches[0] === "true";
}

async function requestFinalGuessJudgement({
  roomCode,
  normalizedGuess,
  finalAnswer,
  attempt,
  excludedCombinations,
}: {
  roomCode: string;
  normalizedGuess: string;
  finalAnswer: string;
  attempt: number;
  excludedCombinations: Set<string>;
}) {
  console.info(
    `[AI][final-judge-attempt] room=${roomCode} attempt=${attempt} action=try`,
  );

  const response = await chatCompletion({
    temperature: 0,
    maxTokens: 120,
    sessionId: `contrapista:room:${roomCode}:final-guess-judge:v1`,
    excludedCombinations: [...excludedCombinations],
    onProgress: async (progress) => {
      if (progress.type === "model_selected") {
        excludedCombinations.add(`${progress.apiKeySlot}:${progress.modelSlot}`);
      }
    },
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Você julga respostas de um jogo investigativo. Retorne somente {"correct":true} ou {"correct":false}, com aspas duplas. Marque true se o palpite segue a linha central da solução oficial, mesmo resumido, incompleto, sem todos os detalhes, com sinônimos, ordem diferente ou erros ortográficos. Não exija que cubra as três respostas numeradas nem todos os pormenores. Marque false apenas se o palpite aponta para um cenário incompatível: outro culpado, método, motivo, local, objeto, cronologia ou explicação que contradiga a solução. Omissão de detalhe, por si só, não é erro. Não explique nem revele raciocínio.',
      },
      {
        role: "user",
        content: `Compare as duas respostas.

Resposta oficial:
${finalAnswer}

Palpite do jogador:
${normalizedGuess}

O palpite resolve corretamente as perguntas centrais do caso?`,
      },
    ],
  });
  const parsed = parseAiBoolean(response.text);

  if (parsed === null) {
    throw new Error(`A IA respondeu avaliação inválida: ${response.text.slice(0, 80)}`);
  }

  console.info(
    `[AI][final-judge-result] room=${roomCode} attempt=${attempt} action=accept correct=${parsed}`,
  );

  return parsed;
}

async function evaluateFinalGuess({
  roomCode,
  guess,
  finalAnswer,
}: {
  roomCode: string;
  guess: string;
  finalAnswer: string;
}) {
  const normalizedGuess = guess.trim();

  if (!normalizedGuess) {
    return false;
  }

  const maxAttempts = Math.min(
    MAX_FINAL_GUESS_JUDGE_ATTEMPTS,
    await getAvailableAiModelCount(),
  );

  if (maxAttempts === 0) {
    throw new AiModelsUnavailableError(
      "Nenhuma combinação de chave e modelo está disponível para analisar o palpite.",
    );
  }

  const errors: string[] = [];
  const excludedCombinations = new Set<string>();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestFinalGuessJudgement({
        roomCode,
        normalizedGuess,
        finalAnswer,
        attempt,
        excludedCombinations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      errors.push(message);
      console.warn(
        `[AI][final-judge-failure] room=${roomCode} attempt=${attempt} action=try-next reason=${message.slice(0, 180).replace(/\s+/g, " ")}`,
      );

      if (
        error instanceof AiModelsUnavailableError &&
        error.failures.length === 0
      ) {
        break;
      }
    }
  }

  throw new Error(
    `Não foi possível avaliar o palpite final após ${errors.length} tentativa(s): ${errors.join(" | ")}`,
  );
}

function buildFinalGuessResolution({
  code,
  actor,
  guess,
  isCorrect,
  latestState,
  latestUsers,
  now,
  config,
}: {
  code: string;
  actor: RoomUser;
  guess: string;
  isCorrect: boolean;
  latestState: GameState;
  latestUsers: RoomUser[];
  now: number;
  config: RoomConfig;
}) {
  const activeevent = {
    id: crypto.randomUUID(),
    type: isCorrect ? "solution_correct" : "solution_wrong",
    actorId: actor.id,
    actorNickname: displayUserName(actor),
    guess: guess.trim(),
    createdAt: now,
  } satisfies RoomEvent;

  if (isCorrect) {
    return {
      activeevent,
      resumedState: latestState,
    };
  }

  const eliminatedState = {
    ...latestState,
    eliminatedUserIds: addEliminatedUser(latestState, actor.id),
  };
  const activeUsers = getActiveUsers(eliminatedState, latestUsers);

  if (!activeUsers.length) {
    return {
      activeevent: {
        id: crypto.randomUUID(),
        type: "solution_no_winner",
        actorId: actor.id,
        actorNickname: displayUserName(actor),
        guess: guess.trim(),
        createdAt: now,
      } satisfies RoomEvent,
      resumedState: {
        ...eliminatedState,
        order: [],
        currentTurnIndex: 0,
        pausedAt: undefined,
        pausedRemainingMs: undefined,
        phaseStartedAt: now,
        phaseEndsAt: now,
      } satisfies GameState,
    };
  }

  const nextOrder = reconcileOrder(
    eliminatedState.order,
    activeUsers,
    `${code}:eliminated`,
  );
  const previousTurnUserId = latestState.order[latestState.currentTurnIndex];
  const preservedTurnIndex = nextOrder.indexOf(previousTurnUserId);
  const nextTurnIndex =
    preservedTurnIndex >= 0
      ? preservedTurnIndex
      : Math.min(latestState.currentTurnIndex, Math.max(0, nextOrder.length - 1));

  return {
    activeevent,
    resumedState: {
      ...eliminatedState,
      order: nextOrder,
      currentTurnIndex: nextTurnIndex,
      pausedAt: undefined,
      pausedRemainingMs: undefined,
      phaseStartedAt: now,
      phaseEndsAt:
        now +
        (latestState.pausedRemainingMs ??
          durationMs(config.clueSelectionTimeSeconds)),
    } satisfies GameState,
  };
}

export async function publishRoomEvent({
  code,
  deferFinalGuessEvaluation = false,
  userId,
  event,
}: {
  code: string;
  deferFinalGuessEvaluation?: boolean;
  userId: string;
  event:
    | { type: "solution" }
    | { type: "solution_guess"; guess: string }
    | { type: "solution_manual_result"; correct: boolean };
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT
          gr.room_code AS code,
          gr.mode,
          gr.users,
          gr.activecase::text AS activecase,
          gr.activeevent,
          gr.gamestate,
          cfg.reading_time_seconds AS "readingTimeSeconds",
          cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
          cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
          cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
          cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
          cfg.true_clues_per_player AS "trueCluesPerPlayer",
          cfg.clues_per_player AS "cluesPerPlayer",
          cfg.timers_enabled AS "timersEnabled"
        FROM game_rooms gr
        LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
        WHERE gr.room_code = $1
        FOR UPDATE OF gr
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const actor = normalizeUsers(room.users).find((user) => user.id === userId);

    if (!actor) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    const currentState = normalizeGameState(room.gamestate);
    const now = Date.now();

    if (!currentState) {
      await client.query("ROLLBACK");
      throw new PublicError("Jogo ainda não foi iniciado.");
    }

    if ((currentState.eliminatedUserIds ?? []).includes(actor.id)) {
      await client.query("ROLLBACK");
      throw new PublicError("Jogadores eliminados não podem interagir com o palpite final.");
    }

    let activeevent: RoomEvent;
    let resumedState: GameState | null = currentState;

    if (event.type === "solution") {
      activeevent = {
        id: crypto.randomUUID(),
        type: "solution",
        actorId: actor.id,
        actorNickname: displayUserName(actor),
        createdAt: now,
      };
      resumedState = currentState.pausedAt
        ? currentState
        : {
            ...currentState,
            pausedAt: now,
            pausedRemainingMs: Math.max(0, currentState.phaseEndsAt - now),
          };
    } else if (event.type === "solution_manual_result") {
      if (currentState.pausedAt === undefined) {
        await client.query("ROLLBACK");
        throw new PublicError("Não há revisão manual em andamento.");
      }

      const reviewEvent = room.activeevent as RoomEvent | null;

      if (
        !reviewEvent ||
        reviewEvent.type !== "solution_manual_review" ||
        reviewEvent.actorId !== actor.id
      ) {
        await client.query("ROLLBACK");
        throw new PublicError("Apenas o autor do palpite pode concluir esta revisão.");
      }

      const resolution = buildFinalGuessResolution({
        code,
        actor,
        guess: reviewEvent.guess ?? "",
        isCorrect: event.correct,
        latestState: currentState,
        latestUsers: normalizeUsers(room.users),
        now,
        config: normalizeRoomConfig(room),
      });

      activeevent = resolution.activeevent;
      resumedState = resolution.resumedState;
    } else {
      if (!room.activecase) {
        await client.query("ROLLBACK");
        throw new PublicError("Caso ativo não encontrado.");
      }

      const currentEvent = room.activeevent as RoomEvent | null;

      if (
        currentEvent?.type === "solution_pending" ||
        currentEvent?.type === "solution_manual_review"
      ) {
        await client.query("ROLLBACK");
        throw new PublicError("Já existe um palpite em avaliação.");
      }

      const pendingEvent = {
        id: crypto.randomUUID(),
        type: "solution_pending",
        actorId: actor.id,
        actorNickname: displayUserName(actor),
        guess: event.guess.trim(),
        createdAt: now,
      } satisfies RoomEvent;
      const stateWithGuess = recordFinalGuessForUser(
        currentState,
        actor.id,
        event.guess,
      );

      await client.query(
        `
          UPDATE game_rooms
          SET activeevent = $2::jsonb,
              gamestate = $3::jsonb,
              updated_at = now()
          WHERE room_code = $1
        `,
        [code, JSON.stringify(pendingEvent), JSON.stringify(stateWithGuess)],
      );

      await client.query("COMMIT");

      if (deferFinalGuessEvaluation) {
        return pendingEvent;
      }

      const finalAnswer = await getCaseFinalAnswer(room.activecase);
      let isCorrect: boolean | null = null;

      try {
        isCorrect = await evaluateFinalGuess({
          roomCode: code,
          guess: event.guess,
          finalAnswer,
        });
      } catch (error) {
        console.warn(
          `[AI][final-judge-manual-review] room=${code} action=manual-review reason=${error instanceof Error ? error.message.slice(0, 220).replace(/\s+/g, " ") : String(error)}`,
        );
      }

      await client.query("BEGIN");
      const latest = await getLockedRoomWithConfig(client, code);
      const latestRoom = latest.rows[0];

      if (!latestRoom) {
        await client.query("ROLLBACK");
        return null;
      }

      const latestState = normalizeGameState(latestRoom.gamestate) ?? currentState;
      const latestUsers = normalizeUsers(latestRoom.users);

      if (isCorrect === null) {
        activeevent = {
          id: crypto.randomUUID(),
          type: "solution_manual_review",
          actorId: actor.id,
          actorNickname: displayUserName(actor),
          guess: event.guess.trim(),
          createdAt: now,
        };
        resumedState = latestState.pausedAt
          ? latestState
          : {
              ...latestState,
              pausedAt: now,
              pausedRemainingMs: Math.max(0, latestState.phaseEndsAt - now),
            };
      } else {
        const resolution = buildFinalGuessResolution({
          code,
          actor,
          guess: event.guess,
          isCorrect,
          latestState,
          latestUsers,
          now,
          config: normalizeRoomConfig(room),
        });

        activeevent = resolution.activeevent;
        resumedState = resolution.resumedState;
      }
    }

    if (
      resumedState &&
      activeevent.type === "solution_wrong" &&
      room.activecase
    ) {
      resumedState = await recordEliminatedPlayerHistory({
        caseId: room.activecase,
        finalAnswer: await getCaseFinalAnswer(room.activecase, client),
        state: resumedState,
        users: normalizeUsers(room.users),
        eliminatedRoomUserId: activeevent.actorId,
        client,
      });
    }

    if (
      resumedState &&
      (activeevent.type === "solution_correct" ||
        activeevent.type === "solution_no_winner")
    ) {
      resumedState = await recordEndedMatch({
        activecase: room.activecase,
        state: resumedState,
        users: normalizeUsers(room.users),
        winnerRoomUserId:
          activeevent.type === "solution_correct" ? activeevent.actorId : null,
        winningFinalGuess:
          activeevent.type === "solution_correct" ? activeevent.guess ?? null : null,
        mode: room.mode ?? "custom",
        client,
      });
    }

    await client.query(
      `
        UPDATE game_rooms
        SET activeevent = $2::jsonb,
            gamestate = $3::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(activeevent), JSON.stringify(resumedState)],
    );

    await client.query("COMMIT");

    return activeevent;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolvePendingFinalGuessEvent({
  code,
  pendingEventId,
}: {
  code: string;
  pendingEventId: string;
}) {
  await ensureSchema();

  const firstClient = await getDbClient();
  let activeCaseId: string | null = null;
  let pendingEvent: RoomEvent | null = null;

  try {
    await firstClient.query("BEGIN");

    const current = await getLockedRoomWithConfig(firstClient, code);
    const room = current.rows[0];

    if (!room) {
      await firstClient.query("ROLLBACK");
      return null;
    }

    const currentEvent = room.activeevent as RoomEvent | null;

    if (
      !currentEvent ||
      currentEvent.type !== "solution_pending" ||
      currentEvent.id !== pendingEventId ||
      !room.activecase
    ) {
      await firstClient.query("ROLLBACK");
      return currentEvent;
    }

    activeCaseId = room.activecase;
    pendingEvent = currentEvent;
    await firstClient.query("COMMIT");
  } catch (error) {
    await firstClient.query("ROLLBACK");
    throw error;
  } finally {
    firstClient.release();
  }

  if (!activeCaseId || !pendingEvent) {
    return null;
  }

  const finalAnswer = await getCaseFinalAnswer(activeCaseId);
  let isCorrect: boolean | null = null;

  try {
    isCorrect = await evaluateFinalGuess({
      roomCode: code,
      guess: pendingEvent.guess ?? "",
      finalAnswer,
    });
  } catch (error) {
    console.warn(
      `[AI][final-judge-manual-review] room=${code} action=manual-review reason=${error instanceof Error ? error.message.slice(0, 220).replace(/\s+/g, " ") : String(error)}`,
    );
  }

  const secondClient = await getDbClient();

  try {
    await secondClient.query("BEGIN");

    const latest = await getLockedRoomWithConfig(secondClient, code);
    const latestRoom = latest.rows[0];

    if (!latestRoom) {
      await secondClient.query("ROLLBACK");
      return null;
    }

    const latestEvent = latestRoom.activeevent as RoomEvent | null;

    if (
      !latestEvent ||
      latestEvent.type !== "solution_pending" ||
      latestEvent.id !== pendingEventId
    ) {
      await secondClient.query("ROLLBACK");
      return latestEvent;
    }

    const latestState = normalizeGameState(latestRoom.gamestate);

    if (!latestState) {
      await secondClient.query("ROLLBACK");
      return latestEvent;
    }

    const latestUsers = normalizeUsers(latestRoom.users);
    const actor = latestUsers.find((user) => user.id === latestEvent.actorId);

    if (!actor) {
      await secondClient.query("ROLLBACK");
      return latestEvent;
    }

    const now = Date.now();
    let activeevent: RoomEvent;
    let resumedState: GameState | null;

    if (isCorrect === null) {
      activeevent = {
        id: crypto.randomUUID(),
        type: "solution_manual_review",
        actorId: latestEvent.actorId,
        actorNickname: latestEvent.actorNickname,
        guess: latestEvent.guess?.trim() ?? "",
        createdAt: now,
      } satisfies RoomEvent;
      resumedState = latestState.pausedAt
        ? latestState
        : {
            ...latestState,
            pausedAt: now,
            pausedRemainingMs: Math.max(0, latestState.phaseEndsAt - now),
          };
    } else {
      const resolution = buildFinalGuessResolution({
        code,
        actor,
        guess: latestEvent.guess ?? "",
        isCorrect,
        latestState,
        latestUsers,
        now,
        config: normalizeRoomConfig(latestRoom),
      });

      activeevent = resolution.activeevent;
      resumedState = resolution.resumedState;
    }

    if (
      resumedState &&
      activeevent.type === "solution_wrong" &&
      latestRoom.activecase
    ) {
      resumedState = await recordEliminatedPlayerHistory({
        caseId: latestRoom.activecase,
        finalAnswer: await getCaseFinalAnswer(latestRoom.activecase, secondClient),
        state: resumedState,
        users: latestUsers,
        eliminatedRoomUserId: activeevent.actorId,
        client: secondClient,
      });
    }

    if (
      resumedState &&
      (activeevent.type === "solution_correct" ||
        activeevent.type === "solution_no_winner")
    ) {
      resumedState = await recordEndedMatch({
        activecase: latestRoom.activecase,
        state: resumedState,
        users: latestUsers,
        winnerRoomUserId:
          activeevent.type === "solution_correct" ? activeevent.actorId : null,
        winningFinalGuess:
          activeevent.type === "solution_correct" ? activeevent.guess ?? null : null,
        mode: latestRoom.mode ?? "custom",
        client: secondClient,
      });
    }

    await secondClient.query(
      `
        UPDATE game_rooms
        SET activeevent = $2::jsonb,
            gamestate = $3::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(activeevent), JSON.stringify(resumedState)],
    );

    await secondClient.query("COMMIT");

    return activeevent;
  } catch (error) {
    await secondClient.query("ROLLBACK");
    throw error;
  } finally {
    secondClient.release();
  }
}

async function getLockedRoomWithConfig(client: DatabaseClient, code: string) {
  return client.query<Room>(
    `
      SELECT
        gr.room_code AS code,
        gr.mode,
        gr.users,
        gr.activecase::text AS activecase,
        gr.activeevent,
        gr.gamestate,
        cfg.reading_time_seconds AS "readingTimeSeconds",
        cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
        cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
        cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
        cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
        cfg.true_clues_per_player AS "trueCluesPerPlayer",
        cfg.clues_per_player AS "cluesPerPlayer",
        cfg.timers_enabled AS "timersEnabled"
      FROM game_rooms gr
      LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
      WHERE gr.room_code = $1
      FOR UPDATE OF gr
    `,
    [code],
  );
}

export async function setGameUserReady({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await getLockedRoomWithConfig(client, code);
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const user = users.find((item) => item.id === userId);

    if (!user) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    const config = normalizeRoomConfig(room);
    const now = Date.now();
    const state =
      normalizeGameState(room.gamestate) ??
      initialGameState(
        {
          code,
          users,
          activecase: room.activecase,
          activeevent: room.activeevent,
          gamestate: null,
        },
        now,
      );

    if (!state) {
      await client.query("ROLLBACK");
      throw new PublicError("Jogo ainda não foi iniciado.");
    }

    if (state.phase !== "ready") {
      await client.query("ROLLBACK");
      return state;
    }

    const readyUserIds = Array.from(
      new Set([...(state.readyUserIds ?? []), user.id]),
    );
    const nextState = areAllUsersReady(
      users.map((item) => item.id),
      readyUserIds,
    )
      ? startReadingPhase({ ...state, readyUserIds }, now, config)
      : { ...state, readyUserIds };

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(nextState)],
    );

    await client.query("COMMIT");

    return nextState;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function skipGamePhase({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await getLockedRoomWithConfig(client, code);
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const user = users.find((item) => item.id === userId);

    if (!user) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    const state = normalizeGameState(room.gamestate);
    const config = normalizeRoomConfig(room);
    const now = Date.now();

    if (
      !state ||
      state.pausedAt ||
      (state.phase !== "reading" &&
        state.phase !== "pause" &&
        state.phase !== "shared_clue")
    ) {
      await client.query("ROLLBACK");
      throw new PublicError("Esta fase não pode ser pulada agora.");
    }

    const activeUsers = getActiveUsers(state, users);

    if (!activeUsers.some((item) => item.id === user.id)) {
      await client.query("ROLLBACK");
      throw new PublicError("Jogadores eliminados não votam para pular fases.");
    }

    const phaseKey = phaseSkipKey(state);
    const currentVotes =
      state.skipVotes?.phaseKey === phaseKey ? state.skipVotes.userIds : [];
    const userIds = activeUsers.map((item) => item.id);
    const nextVotes = Array.from(new Set([...currentVotes, user.id]));
    const votedState = {
      ...state,
      skipVotes: { phaseKey, userIds: nextVotes },
    } satisfies GameState;
    const nextState = areAllUsersReady(userIds, nextVotes)
      ? await advanceGameStateWithAutoShare({
          state: { ...votedState, phaseEndsAt: now, skipVotes: undefined },
          users,
          now,
          seed: `${code}:${room.activecase ?? "case"}`,
          config,
          caseId: room.activecase,
          client,
          forceAdvance: true,
        })
      : votedState;

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(nextState)],
    );

    await client.query("COMMIT");

    return nextState;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function shareRoomClue({
  code,
  userId,
  clueText,
  clueNumber,
  clueId,
}: {
  code: string;
  userId: string;
  clueText: string;
  clueNumber: number;
  clueId?: string;
}) {
  await ensureSchema();

  const trimmedClue = clueText.trim();

  if (!trimmedClue) {
    throw new PublicError("Pista inválida.");
  }

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT
          gr.room_code AS code,
          gr.users,
          gr.activecase::text AS activecase,
          gr.activeevent,
          gr.gamestate,
          cfg.reading_time_seconds AS "readingTimeSeconds",
          cfg.clue_selection_time_seconds AS "clueSelectionTimeSeconds",
          cfg.revealed_clue_analysis_time_seconds AS "revealedClueAnalysisTimeSeconds",
          cfg.round_analysis_time_seconds AS "roundAnalysisTimeSeconds",
          cfg.final_guess_time_seconds AS "finalGuessTimeSeconds",
          cfg.true_clues_per_player AS "trueCluesPerPlayer",
          cfg.clues_per_player AS "cluesPerPlayer",
          cfg.timers_enabled AS "timersEnabled"
        FROM game_rooms gr
        LEFT JOIN game_rooms_config cfg ON cfg.id = gr.config_id
        WHERE gr.room_code = $1
        FOR UPDATE OF gr
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const actor = users.find((user) => user.id === userId);

    if (!actor) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    const state = normalizeGameState(room.gamestate);
    const now = Date.now();
    const config = normalizeRoomConfig(room);
    const nextState = state
      ? await advanceGameStateWithAutoShare({
          state,
          users,
          now,
          seed: `${code}:${room.activecase ?? "case"}`,
          config,
          caseId: room.activecase,
          client,
        })
      : initialGameState(
          {
            code,
            users,
            activecase: room.activecase,
            activeevent: room.activeevent,
            gamestate: null,
          },
          now,
        );

    if (
      !nextState ||
      nextState.phase !== "turn" ||
      nextState.order[nextState.currentTurnIndex] !== actor.id ||
      nextState.pausedAt
    ) {
      await client.query("ROLLBACK");
      throw new PublicError("Não é a vez desse jogador compartilhar uma pista.");
    }

    const totalClues = room.activecase
      ? await getCaseClueCount(room.activecase, client)
      : 0;
    const allPlayerClueCount = users.length > 0 ? Math.floor(totalClues / users.length) : 0;
    const safeClueId = clueId?.trim() || `manual-${clueNumber}`;
    const alreadySharedIds = getSharedClueIds(nextState, actor.id);

    if (
      alreadySharedIds.includes(safeClueId) &&
      alreadySharedIds.length < allPlayerClueCount
    ) {
      await client.query("ROLLBACK");
      throw new PublicError("Essa pista já foi compartilhada. Escolha uma pista diferente.");
    }

    const sharedState: GameState = {
      ...nextState,
      phase: "shared_clue",
      phaseStartedAt: now,
      phaseEndsAt: now + durationMs(config.revealedClueAnalysisTimeSeconds),
      sharedClueIds: markClueShared(nextState, actor.id, safeClueId),
      sharedClue: {
        id: crypto.randomUUID(),
        actorId: actor.id,
        actorNickname: displayUserName(actor),
        clueText: trimmedClue,
        clueNumber,
        clueId: safeClueId,
        createdAt: now,
      },
    };

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(sharedState)],
    );

    await client.query("COMMIT");

    return sharedState;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}


export async function returnRoomCaseToLobby({
  code,
  userId,
}: {
  code: string;
  userId: string;
}) {
  await ensureSchema();

  const client = await getDbClient();

  try {
    await client.query("BEGIN");

    const current = await client.query<Room>(
      `
        SELECT room_code AS code, mode, users, activecase::text AS activecase, activeevent, gamestate
        FROM game_rooms
        WHERE room_code = $1
        FOR UPDATE
      `,
      [code],
    );
    const room = current.rows[0];

    if (!room) {
      await client.query("ROLLBACK");
      return null;
    }

    const users = normalizeUsers(room.users);
    const returningUser = users.find((user) => user.id === userId);

    if (!returningUser) {
      await client.query("ROLLBACK");
      throw new PublicError("Usuário não encontrado na sala.");
    }

    const state =
      normalizeGameState(room.gamestate) ??
      initialGameState(
        {
          ...room,
          users,
          activeevent: room.activeevent,
          gamestate: null,
        },
        Date.now(),
      );
    const returnedToLobbyUserIds = Array.from(
      new Set([...(state?.returnedToLobbyUserIds ?? []), userId]),
    );
    const everyoneReturned =
      users.length > 0 && users.every((user) => returnedToLobbyUserIds.includes(user.id));

    if (everyoneReturned) {
      const resetUsers = users.map((user) => ({
        ...user,
        ready: false,
      }));

      await client.query(
        `
          UPDATE game_rooms
          SET activecase = NULL,
              activeevent = NULL,
              gamestate = NULL,
              users = $2::jsonb,
              updated_at = now()
          WHERE room_code = $1
        `,
        [code, JSON.stringify(resetUsers)],
      );

      await client.query("COMMIT");

      return publicRoom({
        code,
        mode: room.mode,
        users: resetUsers,
        activecase: null,
        activeevent: null,
        gamestate: null,
      });
    }

    const nextState = state
      ? {
          ...state,
          returnedToLobbyUserIds,
        }
      : null;

    await client.query(
      `
        UPDATE game_rooms
        SET gamestate = $2::jsonb,
            updated_at = now()
        WHERE room_code = $1
      `,
      [code, JSON.stringify(nextState)],
    );

    await client.query("COMMIT");

    return publicRoom({
      code,
      mode: room.mode,
      users,
      activecase: room.activecase,
      activeevent: room.activeevent,
      gamestate: nextState,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function finishRoomCase({ code }: { code: string }) {
  await ensureSchema();

  const current = await dbQuery<Room>(
    `
      SELECT room_code AS code, mode, users, activecase::text AS activecase, activeevent, gamestate
      FROM game_rooms
      WHERE room_code = $1
    `,
    [code],
  );
  const room = current.rows[0];

  if (!room) {
    return null;
  }

  const users = normalizeUsers(room.users).map((user) => ({
    ...user,
    ready: false,
  }));

  await dbQuery(
    `
      UPDATE game_rooms
      SET activecase = NULL,
          activeevent = NULL,
          gamestate = NULL,
          users = $2::jsonb,
          updated_at = now()
      WHERE room_code = $1
    `,
    [code, JSON.stringify(users)],
  );

  return publicRoom({
    code,
    mode: room.mode,
    users,
    activecase: null,
    activeevent: null,
    gamestate: null,
  });
}
