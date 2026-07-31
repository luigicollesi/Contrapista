import { auth } from "@/auth";
import { setUserUsername, validateAuthInput } from "@/lib/auth-users";

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

  const body = (await request.json().catch(() => null)) as {
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

  try {
    const user = await setUserUsername({
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
