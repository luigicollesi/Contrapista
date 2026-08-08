import { getAdminDashboard, getAdminSession } from "@/lib/admin";
import { logSecurityEvent } from "@/lib/security/audit-log";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAdminSession();

  if (!session) {
    logSecurityEvent("admin-dashboard", { action: "deny" });
    return Response.json({ error: "Acesso administrativo não autorizado." }, { status: 403 });
  }

  return Response.json(await getAdminDashboard());
}
