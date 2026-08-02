import "server-only";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

type GmailTokenState = {
  accessToken: string | null;
  expiresAt: number;
  refreshPromise: Promise<string> | null;
};

const globalForGmail = globalThis as typeof globalThis & {
  __contrapistaGmailTokenState?: GmailTokenState;
  __contrapistaGmailRefreshStarted?: boolean;
  __contrapistaGmailRefreshInterval?: ReturnType<typeof setInterval>;
};

const tokenState =
  globalForGmail.__contrapistaGmailTokenState ??
  (globalForGmail.__contrapistaGmailTokenState = {
    accessToken: null,
    expiresAt: 0,
    refreshPromise: null,
  });

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} precisa estar configurado para enviar emails.`);
  }

  return value;
}

function getRefreshTokenHint(refreshToken: string) {
  if (!refreshToken) {
    return "refresh-token-missing";
  }

  if (refreshToken.startsWith("4/") || refreshToken.startsWith("4%2F")) {
    return "parece ser um code de autorização, não um refresh_token";
  }

  if (refreshToken.startsWith("ya29.")) {
    return "parece ser um access_token temporário, não um refresh_token";
  }

  if (refreshToken.length < 90) {
    return `refresh_token curto demais para o padrão atual do Google (len=${refreshToken.length})`;
  }

  return `formato não confirmado (len=${refreshToken.length})`;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeHeader(value: string) {
  if (/^[\x00-\x7F]*$/.test(value)) {
    return value;
  }

  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawEmail({
  from,
  html,
  subject,
  text,
  to,
}: {
  from: string;
  html: string;
  subject: string;
  text: string;
  to: string;
}) {
  const boundary = `contrapista-${crypto.randomUUID()}`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return base64UrlEncode(message);
}

export function isGmailConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim() &&
      process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim(),
  );
}

export function getGoogleGmailAuthorizationUrl() {
  const clientId = getRequiredEnv("GOOGLE_CLIENT_ID");
  const redirectUri = getRequiredEnv("GOOGLE_GMAIL_REDIRECT_URI");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SEND_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  if (process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim()) {
    url.searchParams.set("login_hint", process.env.GOOGLE_GMAIL_SENDER_EMAIL.trim());
  }

  return url.toString();
}

async function refreshGmailAccessToken() {
  if (tokenState.refreshPromise) {
    return tokenState.refreshPromise;
  }

  tokenState.refreshPromise = (async () => {
    const refreshToken = getRequiredEnv("GOOGLE_GMAIL_REFRESH_TOKEN");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
        client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      expires_in?: number;
    };

    if (!response.ok || !payload.access_token) {
      throw new Error(
        `Não foi possível renovar acesso ao Gmail: ${payload.error ?? response.status} ${payload.error_description ?? ""}. Verifique GOOGLE_GMAIL_REFRESH_TOKEN: ${getRefreshTokenHint(refreshToken)}.`,
      );
    }

    tokenState.accessToken = payload.access_token;
    tokenState.expiresAt =
      Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000;

    console.info(
      `[gmail][token] action=refresh expiresAt=${new Date(tokenState.expiresAt).toISOString()}`,
    );

    return payload.access_token;
  })().finally(() => {
    tokenState.refreshPromise = null;
  });

  return tokenState.refreshPromise;
}

export async function getGmailAccessToken() {
  if (
    tokenState.accessToken &&
    Date.now() + TOKEN_REFRESH_MARGIN_MS < tokenState.expiresAt
  ) {
    return tokenState.accessToken;
  }

  return refreshGmailAccessToken();
}

export async function sendGmailEmail({
  html,
  subject,
  text,
  to,
}: {
  html: string;
  subject: string;
  text: string;
  to: string;
}) {
  const senderEmail = getRequiredEnv("GOOGLE_GMAIL_SENDER_EMAIL");
  const senderName = process.env.GOOGLE_GMAIL_SENDER_NAME?.trim() || "Contrapista";
  const from = `${encodeHeader(senderName)} <${senderEmail}>`;
  const accessToken = await getGmailAccessToken();
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: buildRawEmail({ from, html, subject, text, to }),
      }),
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    id?: string;
  };

  if (!response.ok) {
    throw new Error(
      `Não foi possível enviar email pelo Gmail: ${payload.error?.message ?? response.status}`,
    );
  }

  console.info(`[gmail][send] action=sent to=${to} messageId=${payload.id ?? "unknown"}`);

  return payload;
}

export function startGmailTokenRefreshScheduler() {
  if (
    globalForGmail.__contrapistaGmailRefreshStarted ||
    !isGmailConfigured()
  ) {
    return;
  }

  globalForGmail.__contrapistaGmailRefreshStarted = true;
  void refreshGmailAccessToken().catch((error) => {
    console.warn(
      `[gmail][token] action=initial-refresh-failed reason=${error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : String(error)}`,
    );
  });
  globalForGmail.__contrapistaGmailRefreshInterval = setInterval(() => {
    void refreshGmailAccessToken().catch((error) => {
      console.warn(
        `[gmail][token] action=scheduled-refresh-failed reason=${error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : String(error)}`,
      );
    });
  }, TOKEN_REFRESH_INTERVAL_MS);

  console.info("[gmail][token] action=scheduler-start");
}
