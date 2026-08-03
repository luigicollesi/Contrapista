import { handlers } from "@/auth";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { NextRequest } from "next/server";

function getConfiguredAuthOrigin() {
  const configured =
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    return null;
  }

  try {
    return new URL(configured).origin;
  } catch {
    return null;
  }
}

function withConfiguredAuthOrigin(request: NextRequest) {
  const configuredOrigin = getConfiguredAuthOrigin();

  if (!configuredOrigin || request.nextUrl.origin === configuredOrigin) {
    return request;
  }

  const nextUrl = new URL(request.url);
  const originUrl = new URL(configuredOrigin);
  nextUrl.protocol = originUrl.protocol;
  nextUrl.host = originUrl.host;

  return new NextRequest(nextUrl, request);
}

export function GET(request: NextRequest) {
  return handlers.GET(withConfiguredAuthOrigin(request));
}

function shouldLimitAuthPost(pathname: string) {
  return (
    pathname.endsWith("/callback/credentials") ||
    pathname.endsWith("/signin/credentials")
  );
}

export async function POST(request: NextRequest) {
  const limited = shouldLimitAuthPost(request.nextUrl.pathname)
    ? rateLimitResponse({
        body: {
          error: "Muitas tentativas de autenticação. Aguarde um instante e tente novamente.",
        },
        limit: 20,
        namespace: "auth-credentials",
        request,
        windowMs: 5 * 60_000,
      })
    : null;

  if (limited) {
    return limited;
  }

  return handlers.POST(withConfiguredAuthOrigin(request));
}
