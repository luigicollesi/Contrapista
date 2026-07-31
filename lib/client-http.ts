const CSRF_HEADER = "x-contrapista-csrf";
const CSRF_HEADER_VALUE = "1";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isStateChangingMethod(method: string | undefined) {
  return !SAFE_METHODS.has((method ?? "GET").toUpperCase());
}

export function withCsrfHeader(init: RequestInit = {}) {
  if (!isStateChangingMethod(init.method)) {
    return init;
  }

  const headers = new Headers(init.headers);

  headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);

  return {
    ...init,
    headers,
  };
}

export async function readJsonResponse<T>(
  response: Response,
  unexpectedTextLimit = 180,
): Promise<T> {
  const text = await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const contentType = response.headers.get("content-type") ?? "";
    const looksLikeHtml =
      contentType.includes("text/html") ||
      /^\s*<!doctype html/i.test(text) ||
      /^\s*<html/i.test(text);
    const message = looksLikeHtml
      ? "O servidor retornou uma página HTML em vez de JSON. Verifique se você está logado, se a rota de API existe no servidor atual e tente recarregar a aplicação."
      : `O servidor retornou uma resposta inesperada: ${text.slice(0, unexpectedTextLimit)}`;

    return {
      error: message,
      unexpectedResponse: true,
    } as T;
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(input, withCsrfHeader(init));
  const data = await readJsonResponse<T & { error?: string }>(response);

  if (!response.ok || "unexpectedResponse" in data) {
    throw new Error(data.error ?? fallbackError);
  }

  return data;
}
