const configuredAuthSecret = process.env.AUTH_SECRET?.trim();

if (process.env.NODE_ENV === "production" && !configuredAuthSecret) {
  throw new Error("AUTH_SECRET precisa estar configurado em produção.");
}

export const AUTH_SECRET =
  configuredAuthSecret ?? "contrapista-dev-auth-secret-change-me";

export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const AUTH_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

const usesSecureAuthCookies = process.env.NODE_ENV === "production";

export const AUTH_SESSION_COOKIE_NAME = usesSecureAuthCookies
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export const AUTH_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: usesSecureAuthCookies,
};
