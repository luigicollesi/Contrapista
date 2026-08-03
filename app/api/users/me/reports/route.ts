import { auth } from "@/auth";
import { errorResponse, PublicError } from "@/lib/api-response";
import { sendGmailEmail } from "@/lib/gmail";
import { rateLimitResponse } from "@/lib/security/rate-limit";

const reportReasons = {
  cheating: "Trapaça",
  disruptive: "Jogo sujo",
  inappropriate_name: "Nome impróprio",
} as const;

function unauthorized() {
  return Response.json(
    { ok: false, message: "Entre para registrar uma denúncia." },
    { status: 401 },
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id || !session.user.name) {
    return unauthorized();
  }

  const limited = rateLimitResponse({
    identity: session.user.id,
    limit: 8,
    namespace: "user-report",
    request,
    windowMs: 60 * 60_000,
  });

  if (limited) {
    return limited;
  }

  const body = (await request.json().catch(() => ({}))) as {
    justification?: unknown;
    matchId?: unknown;
    reason?: unknown;
    reportedUserId?: unknown;
    reportedUsername?: unknown;
  };
  const reason =
    typeof body.reason === "string" && body.reason in reportReasons
      ? (body.reason as keyof typeof reportReasons)
      : null;
  const justification =
    typeof body.justification === "string" ? body.justification.trim().slice(0, 1200) : "";
  const reportedUserId =
    typeof body.reportedUserId === "string" ? body.reportedUserId.trim() : "";
  const reportedUsername =
    typeof body.reportedUsername === "string" ? body.reportedUsername.trim().slice(0, 80) : "";
  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";

  try {
    if (!reason) {
      throw new PublicError("Escolha um motivo para a denúncia.");
    }

    if (!reportedUserId || !reportedUsername) {
      throw new PublicError("Participante inválido.");
    }

    if (reportedUserId === session.user.id) {
      throw new PublicError("Não é possível denunciar o próprio perfil.");
    }

    if (justification.length < 8) {
      throw new PublicError("Inclua uma justificativa breve.");
    }

    const recipient = process.env.GOOGLE_GMAIL_SENDER_EMAIL?.trim();

    if (!recipient) {
      throw new PublicError("Canal de denúncias indisponível.", 503);
    }

    const text = [
      "Nova denúncia no Contrapista.",
      "",
      `Motivo: ${reportReasons[reason]}`,
      `Denunciante: ${session.user.name} (${session.user.id})`,
      `Denunciado: ${reportedUsername} (${reportedUserId})`,
      `Partida: ${matchId || "não informada"}`,
      "",
      "Justificativa:",
      justification,
    ].join("\n");

    await sendGmailEmail({
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f1f1f;">
          <h1>Nova denúncia no Contrapista</h1>
          <p><strong>Motivo:</strong> ${escapeHtml(reportReasons[reason])}</p>
          <p><strong>Denunciante:</strong> ${escapeHtml(session.user.name)} (${escapeHtml(session.user.id)})</p>
          <p><strong>Denunciado:</strong> ${escapeHtml(reportedUsername)} (${escapeHtml(reportedUserId)})</p>
          <p><strong>Partida:</strong> ${escapeHtml(matchId || "não informada")}</p>
          <h2>Justificativa</h2>
          <p>${escapeHtml(justification).replaceAll("\n", "<br />")}</p>
        </div>
      `,
      subject: `[Contrapista] Denúncia: ${reportReasons[reason]}`,
      text,
      to: recipient,
    });

    return Response.json({
      ok: true,
      message: "Denúncia registrada.",
    });
  } catch (error) {
    return errorResponse(error, "Não deu para registrar a denúncia.");
  }
}
