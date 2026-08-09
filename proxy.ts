import { logSecurityEvent } from "@/lib/security/audit-log";
import { validateCsrfRequest } from "@/lib/security/csrf";
import { validateTrustedBackendHost } from "@/lib/security/trusted-hosts";
import { NextResponse, type NextRequest } from "next/server";

const backendApiPrefix = "/api";
const providerCallbackPrefixes = ["/api/auth/callback/google", "/api/auth/callback/github"];
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectsBackendHost =
    isBackendApiPath(pathname) && !isProviderCallbackPath(pathname);
  const protectsCsrf = isProtectedPath(pathname, csrfApiPrefixes);

  if (!protectsBackendHost && !protectsCsrf) {
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
