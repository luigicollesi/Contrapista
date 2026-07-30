export function errorResponse(
  error: unknown,
  fallback: string,
  status = 400,
) {
  const message = error instanceof Error ? error.message : fallback;

  return Response.json({ error: message }, { status });
}
