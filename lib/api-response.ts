import { logSecurityEvent, serializeErrorSafe } from "@/lib/security/audit-log";

type ErrorResponseOptions = {
  expose?: boolean;
  event?: string;
};

export class PublicError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PublicError";
    this.status = status;
  }
}

export function errorResponse(
  error: unknown,
  fallback: string,
  status = 400,
  options: ErrorResponseOptions = {},
) {
  const safeError = serializeErrorSafe(error);
  const responseStatus = error instanceof PublicError ? error.status : status;
  const expose =
    options.expose ??
    (error instanceof PublicError || process.env.NODE_ENV !== "production");
  const message = expose && error instanceof Error ? safeError.message : fallback;

  logSecurityEvent(
    options.event ?? "api-error",
    {
      errorMessage: safeError.message,
      errorName: safeError.name,
      exposed: expose,
      status: responseStatus,
    },
    responseStatus >= 500 ? "error" : "warn",
  );

  return Response.json({ error: message }, { status: responseStatus });
}
