import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-contrapista-csrf";
export const CSRF_HEADER_VALUE = "1";

function isSameOrigin(value: string | null, expectedOrigin: string) {
  if (!value) {
    return false;
  }

  try {
    return new URL(value).origin === expectedOrigin;
  } catch {
    return false;
  }
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

  const expectedOrigin = request.nextUrl.origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && !isSameOrigin(origin, expectedOrigin)) {
    return "Origem da requisição inválida.";
  }

  if (!origin && referer && !isSameOrigin(referer, expectedOrigin)) {
    return "Referência da requisição inválida.";
  }

  const csrfHeader = request.headers.get(CSRF_HEADER);

  if (csrfHeader !== CSRF_HEADER_VALUE) {
    return "Cabeçalho CSRF ausente.";
  }

  return null;
}
