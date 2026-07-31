import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const protectedPagePrefixes = ["/jogar/busca", "/jogar/diario", "/sala"];
const protectedApiPrefixes = [
  "/api/cases",
  "/api/daily-problem",
  "/api/matchmaking",
  "/api/rooms",
];

function isProtectedPath(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectsPage = isProtectedPath(pathname, protectedPagePrefixes);
  const protectsApi = isProtectedPath(pathname, protectedApiPrefixes);

  if (!protectsPage && !protectsApi) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret:
      process.env.AUTH_SECRET ??
      (process.env.NODE_ENV === "production"
        ? undefined
        : "contrapista-dev-auth-secret-change-me"),
  });
  const hasUsername = typeof token?.name === "string" && token.name.trim();

  if (hasUsername) {
    return NextResponse.next();
  }

  if (protectsApi) {
    return Response.json(
      { error: "Faça login e escolha um nome de usuário para continuar." },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/auth/entrar";
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/jogar/busca/:path*",
    "/jogar/diario/:path*",
    "/api/cases/:path*",
    "/sala/:path*",
    "/api/daily-problem/:path*",
    "/api/matchmaking/:path*",
    "/api/rooms/:path*",
  ],
};
