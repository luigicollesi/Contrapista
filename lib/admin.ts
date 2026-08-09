import "server-only";

import { auth } from "@/auth";
import { getAiConfig } from "@/lib/ai/config";
import { getAiModelStandoffStatus } from "@/lib/ai";
import { getTodayFreeModelUsage } from "@/lib/ai/usage";
import { dbQuery } from "@/lib/db";

const ONLINE_WINDOW_SQL = "now() - interval '2 minutes'";

type AdminUserRow = {
  id: string;
  username: string | null;
  email: string;
  provider: string;
  created_at: string;
  last_seen_at: string | null;
  online: boolean;
};

type OpenRouterCreditsResponse = {
  data?: {
    total_credits?: unknown;
    total_usage?: unknown;
  };
};

type OpenRouterActivityResponse = {
  data?: Array<{
    completion_tokens?: unknown;
    model?: unknown;
    prompt_tokens?: unknown;
    reasoning_tokens?: unknown;
    requests?: unknown;
    usage?: unknown;
  }>;
};

type OpenRouterModelUsage = {
  completionTokens: number;
  model: string;
  promptTokens: number;
  reasoningTokens: number;
  requests: number;
  usage: number;
};

export type AdminDashboard = {
  ai: {
    availableCredits: number | null;
    freeTier: {
      models: Array<{ model: string; requests: number; totalTokens: number }>;
      usedToday: number;
    };
    generation: {
      availableCombinations: number;
      status: "available" | "unavailable";
      standoffs: Array<{
        apiKeySlot: string;
        model: string;
        modelSlot: string;
        standoffUntil: number;
      }>;
      totalCombinations: number;
    };
    activity: {
      models: OpenRouterModelUsage[];
      requests: number | null;
      status: "available" | "unavailable";
      tokens: number | null;
    };
    totalCredits: number | null;
    totalUsage: number | null;
    status: "available" | "unavailable";
  };
  onlineUsers: number;
  totalUsers: number;
  users: AdminUserRow[];
};

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;

  const admins = (process.env.ADM_EMAIL ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(email.trim().toLowerCase());
}

export async function getAdminSession() {
  const session = await auth();
  return isAdminEmail(session?.user?.email) ? session : null;
}

async function getOpenRouterCredits() {
  try {
    const config = getAiConfig();
    const response = await fetch(`${config.openRouter.baseUrl}/credits`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${config.openRouter.apiKeys[0]}`,
      },
    });

    if (!response.ok) {
      return {
        availableCredits: null,
        totalCredits: null,
        totalUsage: null,
        status: "unavailable" as const,
      };
    }

    const payload = (await response.json()) as OpenRouterCreditsResponse;
    const totalCredits = asNumber(payload.data?.total_credits);
    const totalUsage = asNumber(payload.data?.total_usage);

    return {
      availableCredits:
        totalCredits !== null && totalUsage !== null
          ? Math.max(0, totalCredits - totalUsage)
          : null,
      totalCredits,
      totalUsage,
      status: "available" as const,
    };
  } catch {
    return {
      availableCredits: null,
      totalCredits: null,
      totalUsage: null,
      status: "unavailable" as const,
    };
  }
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

async function getOpenRouterActivity(apiKey: string, baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/activity?date=${todayUtcDate()}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return { models: [], requests: null, status: "unavailable" as const, tokens: null };
    }

    const payload = (await response.json()) as OpenRouterActivityResponse;
    const models = new Map<string, OpenRouterModelUsage>();

    for (const item of payload.data ?? []) {
      const model = asString(item.model) ?? "Modelo não informado";
      const current = models.get(model) ?? {
        completionTokens: 0,
        model,
        promptTokens: 0,
        reasoningTokens: 0,
        requests: 0,
        usage: 0,
      };
      current.completionTokens += asNumber(item.completion_tokens) ?? 0;
      current.promptTokens += asNumber(item.prompt_tokens) ?? 0;
      current.reasoningTokens += asNumber(item.reasoning_tokens) ?? 0;
      current.requests += asNumber(item.requests) ?? 0;
      current.usage += asNumber(item.usage) ?? 0;
      models.set(model, current);
    }

    const values = [...models.values()].sort((left, right) => right.requests - left.requests);
    return {
      models: values,
      requests: values.reduce((total, item) => total + item.requests, 0),
      status: "available" as const,
      tokens: values.reduce(
        (total, item) => total + item.promptTokens + item.completionTokens + item.reasoningTokens,
        0,
      ),
    };
  } catch {
    return { models: [], requests: null, status: "unavailable" as const, tokens: null };
  }
}

async function getOpenRouterUsage() {
  const config = getAiConfig();
  const activityApiKey =
    process.env.OPENROUTER_MANAGEMENT_API_KEY?.trim() || config.openRouter.apiKeys[0];
  const [credits, activity, freeModelRequests, generation] = await Promise.all([
    getOpenRouterCredits(),
    getOpenRouterActivity(activityApiKey, config.openRouter.baseUrl),
    getTodayFreeModelUsage(),
    getAiModelStandoffStatus(),
  ]);
  const generationStatus: "available" | "unavailable" =
    generation.totalCount > 0 && generation.availableCount === 0
      ? "unavailable"
      : "available";

  return {
    ...credits,
    activity,
    freeTier: {
      models: freeModelRequests.models,
      usedToday: freeModelRequests.requests,
    },
    generation: {
      availableCombinations: generation.availableCount,
      status: generationStatus,
      standoffs: generation.standoffs,
      totalCombinations: generation.totalCount,
    },
  };
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const [usersResult, onlineResult, totalResult, ai] = await Promise.all([
    dbQuery<AdminUserRow>(`
      SELECT
        users.id::text AS id,
        users.username,
        users.email,
        users.provider,
        users.created_at,
        presence.last_seen_at,
        (presence.last_seen_at > ${ONLINE_WINDOW_SQL}) AS online
      FROM users
      LEFT JOIN user_presence presence ON presence.user_id = users.id
      ORDER BY presence.last_seen_at DESC NULLS LAST, users.created_at DESC
      LIMIT 200
    `),
    dbQuery<{ count: string }>(`
      SELECT count(*)::text AS count
      FROM user_presence
      WHERE last_seen_at > ${ONLINE_WINDOW_SQL}
    `),
    dbQuery<{ count: string }>("SELECT count(*)::text AS count FROM users"),
    getOpenRouterUsage(),
  ]);

  return {
    ai,
    onlineUsers: Number(onlineResult.rows[0]?.count ?? 0),
    totalUsers: Number(totalResult.rows[0]?.count ?? 0),
    users: usersResult.rows,
  };
}
