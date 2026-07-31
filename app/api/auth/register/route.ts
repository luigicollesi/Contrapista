import { createCredentialsUser, validateAuthInput } from "@/lib/auth-users";
import { rateLimitResponse } from "@/lib/security/rate-limit";

function getUniqueConstraint(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    typeof error.constraint === "string"
  )
    ? error.constraint
    : "";
}

export async function POST(request: Request) {
  const limited = rateLimitResponse({
    body: {
      ok: false,
      message: "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.",
    },
    limit: 5,
    namespace: "auth-register",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    username?: unknown;
    email?: unknown;
    password?: unknown;
  } | null;
  const parsed = validateAuthInput({
    username: body?.username ?? body?.name,
    email: body?.email,
    password: body?.password,
  });

  if (!parsed.ok) {
    return Response.json(
      { ok: false, errors: parsed.errors },
      { status: 400 },
    );
  }

  try {
    await createCredentialsUser(parsed.data);

    return Response.json({ ok: true });
  } catch (error) {
    const uniqueConstraint = getUniqueConstraint(error);

    if (uniqueConstraint === "users_email_normalized_unique") {
      return Response.json(
        { ok: false, errors: { email: "Este email já está cadastrado." } },
        { status: 409 },
      );
    }

    if (uniqueConstraint === "users_username_normalized_unique") {
      return Response.json(
        {
          ok: false,
          errors: { username: "Este nome de usuário já está em uso." },
        },
        { status: 409 },
      );
    }

    console.error("[auth][register]", error);

    return Response.json(
      { ok: false, message: "Não foi possível criar a conta agora." },
      { status: 500 },
    );
  }
}
