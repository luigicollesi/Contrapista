import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-contrapista-csrf";
export const CSRF_HEADER_VALUE = "1";

function originFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function buildOrigin(protocol: string | null, host: string | null) {
  if (!host) {
    return null;
  }

  const normalizedProtocol = protocol?.replace(/:$/, "") || "https";

  return `${normalizedProtocol}://${host}`;
}

function getAllowedOrigins(request: NextRequest) {
  const origins = new Set<string>();
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const host = firstHeaderValue(request.headers.get("host"));

  origins.add(request.nextUrl.origin);

  const forwardedOrigin = buildOrigin(forwardedProto, forwardedHost);
  const hostOrigin = buildOrigin(forwardedProto ?? request.nextUrl.protocol, host);
  const authOrigin =
    originFromUrl(process.env.AUTH_URL) ?? originFromUrl(process.env.NEXTAUTH_URL);

  if (forwardedOrigin) {
    origins.add(forwardedOrigin);
  }

  if (hostOrigin) {
    origins.add(hostOrigin);
  }

  if (authOrigin) {
    origins.add(authOrigin);
  }

  return origins;
}

function isAllowedOrigin(value: string | null, allowedOrigins: Set<string>) {
  const origin = originFromUrl(value);

  return Boolean(origin && allowedOrigins.has(origin));
}

export function isStateChangingRequest(request: Request) {
  return !SAFE_METHODS.has(request.method.toUpperCase());
}

export function validateCsrfRequest(request: NextRequest) {
  if (!isStateChangingRequest(request)) {
    return null;
  }

  const secFetchSite = request.headers.get("sec-fetch-site");

  if (secFetchSite === "cross-site") {
    return "Requisição cross-site bloqueada.";
  }

  const allowedOrigins = getAllowedOrigins(request);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return "Origem da requisição inválida.";
  }

  if (!origin && referer && !isAllowedOrigin(referer, allowedOrigins)) {
    return "Referência da requisição inválida.";
  }

  const csrfHeader = request.headers.get(CSRF_HEADER);

  if (csrfHeader !== CSRF_HEADER_VALUE) {
    return "Cabeçalho CSRF ausente.";
  }

  return null;
}
