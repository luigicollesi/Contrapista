const scope = "https://www.googleapis.com/auth/gmail.send";

function getEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} precisa estar configurado.`);
  }

  return value;
}

function buildAuthorizationUrl() {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", getEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getEnv("GOOGLE_GMAIL_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  if (process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim()) {
    url.searchParams.set("login_hint", process.env.GOOGLE_GMAIL_SENDER_EMAIL.trim());
  }

  return url.toString();
}

function getCodeArg() {
  const codeArg = process.argv.find((arg) => arg.startsWith("--code="));

  return codeArg?.slice("--code=".length).trim();
}

async function exchangeCode(code) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: getEnv("GOOGLE_GMAIL_REDIRECT_URI"),
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Falha ao trocar code: ${payload.error_description ?? payload.error ?? response.status}`,
    );
  }

  console.log("GOOGLE_GMAIL_REFRESH_TOKEN=" + (payload.refresh_token ?? ""));
  console.log("GOOGLE_GMAIL_ACCESS_TOKEN=" + (payload.access_token ?? ""));
  console.log("expires_in=" + (payload.expires_in ?? ""));

  if (!payload.refresh_token) {
    console.log(
      "Nenhum refresh_token foi retornado. Revogue o acesso anterior do app em https://myaccount.google.com/permissions e rode novamente com prompt=consent.",
    );
  }
}

const code = getCodeArg();

if (!code) {
  console.log("Abra esta URL, aceite com o email remetente e copie o parâmetro code:");
  console.log(buildAuthorizationUrl());
} else {
  await exchangeCode(code);
}
