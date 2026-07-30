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
    return {
      error: `O servidor retornou uma resposta inesperada: ${text.slice(0, unexpectedTextLimit)}`,
    } as T;
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(input, init);
  const data = await readJsonResponse<T & { error?: string }>(response);

  if (!response.ok) {
    throw new Error(data.error ?? fallbackError);
  }

  return data;
}
