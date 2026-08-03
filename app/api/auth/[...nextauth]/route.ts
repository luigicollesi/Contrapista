import { handlers } from "@/auth";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import type { NextRequest } from "next/server";

export const { GET } = handlers;

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

  return handlers.POST(request);
}
