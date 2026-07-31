import { auth } from "@/auth";
import { ensureUserAchievements } from "@/lib/auth-users";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return Response.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  }

  const achievements = await ensureUserAchievements(session.user.id);

  return Response.json({ ok: true, achievements });
}
