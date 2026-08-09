import { AUTH_SECRET } from "@/lib/auth-config";
import { logSecurityEvent } from "@/lib/security/audit-log";
import { validateCsrfRequest } from "@/lib/security/csrf";
import { validateTrustedBackendHost } from "@/lib/security/trusted-hosts";
import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const backendApiPrefix = "/api";
const providerCallbackPrefixes = ["/api/auth/callback/google", "/api/auth/callback/github"];
const protectedPagePrefixes = ["/adm", "/jogar/busca", "/jogar/diario", "/sala"];
const protectedApiPrefixes = [
  "/api/cases",
  "/api/daily-problem",
  "/api/matchmaking",
  "/api/rooms",
  "/api/users",
];
const csrfApiPrefixes = [
  ...protectedApiPrefixes,
  "/api/auth/register",
  "/api/auth/username",
];

function isProtectedPath(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isBackendApiPath(pathname: string) {
  return pathname === backendApiPrefix || pathname.startsWith(`${backendApiPrefix}/`);
}

function isProviderCallbackPath(pathname: string) {
  return isProtectedPath(pathname, providerCallbackPrefixes);
}

const SECURE_AUTH_COOKIE = "__Secure-authjs.session-token";
const AUTH_COOKIE = "authjs.session-token";

function hasAuthenticatedToken(token: JWT | null) {
  if (!token || typeof token === "string") {
    return false;
  }

  return typeof token?.id === "string" || typeof token?.sub === "string";
}

async function readAuthToken(request: NextRequest) {
  const cookieNames = request.cookies.has(SECURE_AUTH_COOKIE)
    ? [SECURE_AUTH_COOKIE, AUTH_COOKIE]
    : [AUTH_COOKIE, SECURE_AUTH_COOKIE];

  for (const cookieName of cookieNames) {
    try {
      const token = await getToken({
        cookieName,
        req: request,
        secret: AUTH_SECRET,
      });

      if (token) {
        return token;
      }
    } catch (error) {
      logSecurityEvent("auth-token-read", {
        action: "ignore-invalid-token",
        cookieName,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectsBackendHost =
    isBackendApiPath(pathname) && !isProviderCallbackPath(pathname);
  const protectsPage = isProtectedPath(pathname, protectedPagePrefixes);
  const protectsApi = isProtectedPath(pathname, protectedApiPrefixes);
  const protectsCsrf = isProtectedPath(pathname, csrfApiPrefixes);

  if (!protectsBackendHost && !protectsPage && !protectsApi && !protectsCsrf) {
    return NextResponse.next();
  }

  if (protectsBackendHost) {
    const hostError = validateTrustedBackendHost(request);

    if (hostError) {
      logSecurityEvent("trusted-host", {
        action: "block",
        path: pathname,
        requestHost: hostError.requestHost,
        trustedHostsCount: hostError.trustedHostsCount,
      });

      return Response.json({ error: "Host não autorizado." }, { status: 403 });
    }
  }

  if (protectsCsrf) {
    const csrfError = validateCsrfRequest(request);

    if (csrfError) {
      logSecurityEvent("csrf", {
        action: "block",
        method: request.method,
        path: pathname,
        reason: csrfError,
      });

      return Response.json({ error: "Requisição bloqueada por segurança." }, { status: 403 });
    }
  }

  if (!protectsPage && !protectsApi) {
    return NextResponse.next();
  }

  const token = await readAuthToken(request);

  if (hasAuthenticatedToken(token)) {
    return NextResponse.next();
  }

  if (protectsApi) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/auth/entrar";
  loginUrl.searchParams.set(
    "callbackUrl",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/adm/:path*",
    "/jogar/busca/:path*",
    "/jogar/diario/:path*",
    "/sala/:path*",
  ],
};
