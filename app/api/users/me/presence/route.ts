import { auth } from "@/auth";
import { errorResponse } from "@/lib/api-response";
import { touchUserPresence } from "@/lib/friends";
import { rateLimitResponse } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ ok: false, message: "Entre para continuar." }, { status: 401 });
  }

  const limited = rateLimitResponse({
    body: {
      ok: false,
      message: "Muitas atualizações em pouco tempo. Aguarde um instante.",
    },
    identity: session.user.id,
    limit: 30,
    namespace: "user-presence",
    request,
    windowMs: 60_000,
  });

  if (limited) {
    return limited;
  }

  try {
    await touchUserPresence(session.user.id);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Não deu para atualizar presença.");
  }
}
