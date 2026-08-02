import { auth } from "@/auth";
import {
  hasAcceptedTerms,
  setUserUsername,
  validateAuthInput,
} from "@/lib/auth-users";
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
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json(
      { ok: false, message: "Faça login para escolher um nome de usuário." },
      { status: 401 },
    );
  }

  const limited = rateLimitResponse({
    body: {
      ok: false,
      message: "Muitas tentativas de nome de usuário. Aguarde um instante e tente novamente.",
    },
    identity: session.user.id,
    limit: 8,
    namespace: "auth-username",
    request,
    windowMs: 10 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const body = (await request.json().catch(() => null)) as {
    termsAccepted?: unknown;
    username?: unknown;
  } | null;
  const parsed = validateAuthInput({
    username: body?.username,
    email: session.user.email,
    password: "Senha1234",
  });

  if (parsed.errors.username) {
    return Response.json(
      { ok: false, errors: { username: parsed.errors.username } },
      { status: 400 },
    );
  }

  if (!hasAcceptedTerms(body?.termsAccepted)) {
    return Response.json(
      {
        ok: false,
        errors: { terms: "Aceite os termos de uso para salvar seu nome." },
      },
      { status: 400 },
    );
  }

  try {
    const user = await setUserUsername({
      acceptedTerms: true,
      userId: session.user.id,
      username: parsed.data.username,
    });

    if (!user) {
      return Response.json(
        { ok: false, message: "Usuário não encontrado." },
        { status: 404 },
      );
    }

    return Response.json({ ok: true, user });
  } catch (error) {
    if (getUniqueConstraint(error) === "users_username_normalized_unique") {
      return Response.json(
        {
          ok: false,
          errors: { username: "Este nome de usuário já está em uso." },
        },
        { status: 409 },
      );
    }

    console.error("[auth][username]", error);

    return Response.json(
      { ok: false, message: "Não foi possível salvar o nome de usuário." },
      { status: 500 },
    );
  }
}
