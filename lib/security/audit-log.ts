type SecurityFieldValue =
  | boolean
  | number
  | string
  | null
  | undefined;

type SecurityLogLevel = "error" | "info" | "warn";

const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|cookie|key|password|secret|token)/i;
const MAX_FIELD_LENGTH = 220;

function sanitizeText(value: string) {
  const singleLine = value.replace(/[\r\n\t]+/g, " ").trim();

  return singleLine.length > MAX_FIELD_LENGTH
    ? `${singleLine.slice(0, MAX_FIELD_LENGTH)}...`
    : singleLine;
}

function formatFieldValue(key: string, value: SecurityFieldValue) {
  if (value === undefined) {
    return null;
  }

  if (value === null) {
    return `${key}=null`;
  }

  if (SENSITIVE_FIELD_PATTERN.test(key)) {
    return `${key}=[redacted]`;
  }

  return `${key}=${sanitizeText(String(value))}`;
}

export function hashIdentifier(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function maskEmail(email: string) {
  const [name, domain] = email.trim().toLowerCase().split("@");

  if (!name || !domain) {
    return hashIdentifier(email);
  }

  const maskedName =
    name.length <= 2 ? `${name[0] ?? "*"}*` : `${name[0]}***${name.at(-1)}`;

  return `${maskedName}@${domain}`;
}

export function serializeErrorSafe(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: sanitizeText(String(error ?? "unknown")),
      name: "UnknownError",
    };
  }

  return {
    message: sanitizeText(error.message),
    name: error.name,
  };
}

export function logSecurityEvent(
  event: string,
  fields: Record<string, SecurityFieldValue> = {},
  level: SecurityLogLevel = "warn",
) {
  const formattedFields = Object.entries(fields)
    .map(([key, value]) => formatFieldValue(key, value))
    .filter((value): value is string => Boolean(value));
  const message = [`[security][${event}]`, ...formattedFields].join(" ");

  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "info") {
    console.info(message);
    return;
  }

  console.warn(message);
}
