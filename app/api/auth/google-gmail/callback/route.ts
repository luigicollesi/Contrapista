export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") ?? "";
  const error = searchParams.get("error") ?? "";

  if (error) {
    return new Response(`Falha na autorização do Gmail: ${error}`, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 400,
    });
  }

  if (!code) {
    return new Response("Callback recebido sem code.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 400,
    });
  }

  return new Response(
    [
      "Autorização recebida.",
      "",
      "Rode localmente:",
      `node --env-file=.env scripts/generate-google-gmail-refresh-token.mjs --code=${code}`,
      "",
      "Depois salve GOOGLE_GMAIL_REFRESH_TOKEN no .env e reinicie o servidor.",
    ].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
