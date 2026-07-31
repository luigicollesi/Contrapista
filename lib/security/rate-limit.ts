import "server-only";

import { hashIdentifier, logSecurityEvent } from "@/lib/security/audit-log";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitOptions = {
  identity?: string | null;
  limit: number;
  namespace: string;
  request: Request;
  windowMs: number;
};

type RateLimitResponseOptions = RateLimitOptions & {
  body?: unknown;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __contrapistaRateLimitStore?: Map<string, RateLimitEntry>;
  __contrapistaRateLimitLastCleanup?: number;
};

const store =
  globalForRateLimit.__contrapistaRateLimitStore ??
  (globalForRateLimit.__contrapistaRateLimitStore = new Map());

const CLEANUP_INTERVAL_MS = 60_000;

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwardedIp ??
    "unknown"
  );
}

function cleanupExpired(now: number) {
  const lastCleanup = globalForRateLimit.__contrapistaRateLimitLastCleanup ?? 0;

  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }

  globalForRateLimit.__contrapistaRateLimitLastCleanup = now;
}

function getRateLimitKey({ identity, namespace, request }: RateLimitOptions) {
  const ipHash = hashIdentifier(getClientIp(request));
  const identityHash = identity ? hashIdentifier(identity) : "anonymous";

  return `${namespace}:${identityHash}:${ipHash}`;
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const key = getRateLimitKey(options);
  const current = store.get(key);

  cleanupExpired(now);

  if (!current || current.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });

    return {
      allowed: true,
      limit: options.limit,
      remaining: options.limit - 1,
      resetAt: now + options.windowMs,
      retryAfterSeconds: 0,
    };
  }

  current.count += 1;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((current.resetAt - now) / 1000),
  );
  const remaining = Math.max(0, options.limit - current.count);

  return {
    allowed: current.count <= options.limit,
    limit: options.limit,
    remaining,
    resetAt: current.resetAt,
    retryAfterSeconds,
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed
      ? {}
      : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}

export function rateLimitResponse(options: RateLimitResponseOptions) {
  const result = checkRateLimit(options);

  if (result.allowed) {
    return null;
  }

  logSecurityEvent("rate-limit", {
    action: "block",
    identity: options.identity ? hashIdentifier(options.identity) : "anonymous",
    ip: hashIdentifier(getClientIp(options.request)),
    limit: result.limit,
    namespace: options.namespace,
    retryAfterSeconds: result.retryAfterSeconds,
  });

  return Response.json(
    options.body ?? {
      error: "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.",
    },
    {
      headers: rateLimitHeaders(result),
      status: 429,
    },
  );
}
