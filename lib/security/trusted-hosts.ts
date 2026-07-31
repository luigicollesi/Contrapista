import type { NextRequest } from "next/server";

const TRUSTED_HOSTS_ENV = "BACKEND_TRUSTED_HOSTS";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function normalizeHost(value: string) {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).host;
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
  }
}

function parseTrustedHosts() {
  return (process.env[TRUSTED_HOSTS_ENV] ?? "")
    .split(",")
    .map((host) => normalizeHost(host))
    .filter((host): host is string => Boolean(host));
}

function hostMatchesTrustedEntry(host: string, trustedHost: string) {
  if (trustedHost.startsWith("*.")) {
    const suffix = trustedHost.slice(1);

    return host.endsWith(suffix) && host.length > suffix.length;
  }

  return host === trustedHost;
}

function isTrustedHost(host: string | null, trustedHosts: string[]) {
  const normalizedHost = host ? normalizeHost(host) : null;

  if (!normalizedHost) {
    return false;
  }

  return trustedHosts.some((trustedHost) =>
    hostMatchesTrustedEntry(normalizedHost, trustedHost),
  );
}

export function getRequestHostForTrust(request: NextRequest) {
  return (
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host")) ??
    request.nextUrl.host
  );
}

export function validateTrustedBackendHost(request: NextRequest) {
  const trustedHosts = parseTrustedHosts();

  if (trustedHosts.length === 0) {
    return null;
  }

  const requestHost = getRequestHostForTrust(request);

  return isTrustedHost(requestHost, trustedHosts)
    ? null
    : {
        requestHost: requestHost ?? "unknown",
        trustedHostsCount: trustedHosts.length,
      };
}
