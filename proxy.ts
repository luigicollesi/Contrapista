import { AUTH_SECRET } from "@/lib/auth-config";
import { logSecurityEvent } from "@/lib/security/audit-log";
import { validateCsrfRequest } from "@/lib/security/csrf";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const protectedPagePrefixes = ["/jogar/busca", "/jogar/diario", "/sala"];
const protectedApiPrefixes = [
  "/api/cases",
  "/api/daily-problem",
  "/api/matchmaking",
  "/api/rooms",
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

function hasAuthenticatedToken(token: Awaited<ReturnType<typeof getToken>>) {
  if (!token || typeof token === "string") {
    return false;
  }

  return typeof token?.id === "string" || typeof token?.sub === "string";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectsPage = isProtectedPath(pathname, protectedPagePrefixes);
  const protectsApi = isProtectedPath(pathname, protectedApiPrefixes);
  const protectsCsrf = isProtectedPath(pathname, csrfApiPrefixes);

  if (!protectsPage && !protectsApi && !protectsCsrf) {
    return NextResponse.next();
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

  const token = await getToken({
    req: request,
    secret: AUTH_SECRET,
  });

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
    "/jogar/busca/:path*",
    "/jogar/diario/:path*",
    "/api/cases/:path*",
    "/api/auth/register",
    "/api/auth/username",
    "/sala/:path*",
    "/api/daily-problem/:path*",
    "/api/matchmaking/:path*",
    "/api/rooms/:path*",
  ],
};
