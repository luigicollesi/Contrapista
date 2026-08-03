import "server-only";

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { dbQuery } from "@/lib/db";
import {
  createVerifiedCredentialsUser,
  ensureUsersSchema,
  hashAuthPassword,
  normalizeEmail,
} from "@/lib/auth-users";
import { sendGmailEmail } from "@/lib/gmail";

const EMAIL_VERIFICATION_TOKEN_BYTES = 32;
const EMAIL_VERIFICATION_TTL_MS = 60 * 60 * 1000;

export class EmailVerificationConflictError extends Error {
  constructor(
    readonly field: "email" | "username",
    message: string,
  ) {
    super(message);
    this.name = "EmailVerificationConflictError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqualsHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getAppBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildVerificationEmail({
  url,
  username,
}: {
  url: string;
  username: string;
}) {
  const escapedUsername = escapeHtml(username);
  const escapedUrl = escapeHtml(url);
  const text = [
    `Olá, ${username}.`,
    "",
    "Confirme seu email para começar a jogar Contrapista.",
    "",
    "Clique no link abaixo:",
    url,
    "",
    "O link vale por 1 hora. Se você não criou essa conta, ignore este email.",
  ].join("\n");
  const html = `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      :root {
        color-scheme: light dark;
        supported-color-schemes: light dark;
      }

      @media (prefers-color-scheme: dark) {
        .email-body { background: #0e1111 !important; }
        .email-shell { background: #171a1a !important; border-color: #5b4828 !important; }
        .email-panel { background: #101414 !important; border-color: #3f3422 !important; }
        .email-title { color: #f2e6c8 !important; }
        .email-text { color: #d6d0c4 !important; }
        .email-muted { color: #9b9488 !important; }
        .email-link { color: #f5e7bd !important; }
      }

      @media screen and (max-width: 620px) {
        .email-wrap { padding: 18px 12px !important; }
        .email-shell { border-radius: 12px !important; }
        .email-content { padding: 28px 20px !important; }
        .email-title { font-size: 32px !important; line-height: 1.05 !important; }
        .email-button { display: block !important; width: 100% !important; box-sizing: border-box !important; }
      }
    </style>
  </head>
  <body class="email-body" style="margin:0;padding:0;background:#f3ead6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Confirme seu email para começar a jogar Contrapista.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3ead6;" class="email-body">
      <tr>
        <td class="email-wrap" align="center" style="padding:34px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-shell" style="max-width:640px;border-collapse:separate;background:#fffaf0;border:1px solid #d0a85c;border-radius:18px;overflow:hidden;box-shadow:0 18px 55px rgba(31,23,12,0.16);">
            <tr>
              <td style="background:#171a1a;padding:22px 28px;border-bottom:3px solid #d0a85c;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td>
                      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;color:#d0a85c;">
                        Contrapista
                      </p>
                      <p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#f2e6c8;">
                        Verificação de email
                      </p>
                    </td>
                    <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#9b9488;">
                      Link válido por 1 hora
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td class="email-content" style="padding:42px 38px 36px;">
                <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2.4px;text-transform:uppercase;font-weight:800;color:#7c1f2a;">
                  Falta pouco
                </p>
                <h1 class="email-title" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.04;color:#21170f;font-weight:700;">
                  Confirme seu email para entrar na mesa.
                </h1>
                <p class="email-text" style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#3d3428;">
                  Olá, <strong>${escapedUsername}</strong>. Use o botão abaixo para confirmar seu email e começar a disputar partidas no Contrapista.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:30px 0 0;border-collapse:collapse;">
                  <tr>
                    <td>
                      <a class="email-button" href="${escapedUrl}" style="display:inline-block;background:#d0a85c;color:#17130d;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase;text-decoration:none;padding:15px 22px;border-radius:4px;">
                        Verificar email
                      </a>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="email-panel" style="margin:32px 0 0;border-collapse:separate;background:#f7efd9;border:1px solid #e2ca91;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p class="email-text" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#4b4032;">
                        Se o botão não funcionar, copie e cole este link no navegador:
                      </p>
                      <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;word-break:break-all;">
                        <a class="email-link" href="${escapedUrl}" style="color:#7c1f2a;text-decoration:underline;">${escapedUrl}</a>
                      </p>
                    </td>
                  </tr>
                </table>

                <p class="email-muted" style="margin:24px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.7;color:#7b7062;">
                  Se você não pediu esse cadastro, ignore este email.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px;background:#171a1a;border-top:1px solid rgba(208,168,92,0.35);">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#b8ad9b;">
                  Contrapista · investigação competitiva online
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;

  return { html, text };
}

export async function ensureEmailVerificationSchema() {
  await ensureUsersSchema();
  await dbQuery(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      email text NOT NULL,
      username text,
      password_hash text,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE email_verification_tokens
      ALTER COLUMN user_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS username text,
      ADD COLUMN IF NOT EXISTS password_hash text;

    CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
      ON email_verification_tokens (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx
      ON email_verification_tokens (expires_at);

    CREATE INDEX IF NOT EXISTS email_verification_tokens_email_idx
      ON email_verification_tokens (lower(btrim(email)), created_at DESC);

    CREATE INDEX IF NOT EXISTS email_verification_tokens_username_idx
      ON email_verification_tokens (lower(btrim(username)), created_at DESC)
      WHERE username IS NOT NULL;
  `);
}

async function assertUserIsAvailable({
  email,
  username,
}: {
  email: string;
  username: string;
}) {
  const result = await dbQuery<{ field: "email" | "username" }>(
    `
      SELECT 'email' AS field
      FROM users
      WHERE email_normalized = $1
      UNION ALL
      SELECT 'username' AS field
      FROM users
      WHERE lower(btrim(username)) = lower(btrim($2))
      LIMIT 1
    `,
    [normalizeEmail(email), username],
  );
  const field = result.rows[0]?.field;

  if (field === "email") {
    throw new EmailVerificationConflictError(
      "email",
      "Este email já está cadastrado.",
    );
  }

  if (field === "username") {
    throw new EmailVerificationConflictError(
      "username",
      "Este nome de usuário já está em uso.",
    );
  }
}

export async function sendPendingEmailVerification({
  email,
  password,
  username,
}: {
  email: string;
  password: string;
  username: string;
}) {
  await ensureEmailVerificationSchema();
  await assertUserIsAvailable({ email, username });

  const token = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashAuthPassword(password);

  await dbQuery(
    `
      UPDATE email_verification_tokens
      SET used_at = now()
      WHERE used_at IS NULL
        AND user_id IS NULL
        AND (
          lower(btrim(email)) = $1
          OR lower(btrim(username)) = lower(btrim($2))
        )
    `,
    [normalizedEmail, username],
  );
  await dbQuery(
    `
      INSERT INTO email_verification_tokens (
        token_hash,
        email,
        username,
        password_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [tokenHash, normalizedEmail, username.trim(), passwordHash, expiresAt],
  );

  const url = `${getAppBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const emailBody = buildVerificationEmail({ url, username });

  await sendGmailEmail({
    html: emailBody.html,
    subject: "Confirme seu email no Contrapista",
    text: emailBody.text,
    to: normalizedEmail,
  });
}

export async function sendEmailVerification({
  email,
  userId,
  username,
}: {
  email: string;
  userId: string;
  username: string;
}) {
  await ensureEmailVerificationSchema();

  const token = randomBytes(EMAIL_VERIFICATION_TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await dbQuery(
    `
      UPDATE email_verification_tokens
      SET used_at = now()
      WHERE user_id = $1::uuid
        AND used_at IS NULL
    `,
    [userId],
  );
  await dbQuery(
    `
      INSERT INTO email_verification_tokens (user_id, token_hash, email, expires_at)
      VALUES ($1::uuid, $2, $3, $4)
    `,
    [userId, tokenHash, email, expiresAt],
  );

  const url = `${getAppBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const emailBody = buildVerificationEmail({ url, username });

  await sendGmailEmail({
    html: emailBody.html,
    subject: "Confirme seu email no Contrapista",
    text: emailBody.text,
    to: email,
  });
}

export async function verifyEmailToken(token: string) {
  await ensureEmailVerificationSchema();

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return { ok: false, reason: "invalid" as const };
  }

  const tokenHash = hashToken(token);
  const result = await dbQuery<{
    email: string;
    id: string;
    password_hash: string | null;
    token_hash: string;
    user_id: string | null;
    username: string | null;
  }>(
    `
      SELECT
        id::text AS id,
        email,
        password_hash,
        token_hash,
        user_id::text AS user_id,
        username
      FROM email_verification_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      LIMIT 1
    `,
    [tokenHash],
  );
  const row = result.rows[0];

  if (!row || !safeEqualsHex(row.token_hash, tokenHash)) {
    return { ok: false, reason: "expired" as const };
  }

  if (row.user_id) {
    await dbQuery(
      `
        UPDATE users
        SET email_verified = true,
            email_verified_at = now(),
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [row.user_id],
    );
  } else {
    if (!row.username || !row.password_hash) {
      return { ok: false, reason: "invalid" as const };
    }

    try {
      await createVerifiedCredentialsUser({
        email: row.email,
        passwordHash: row.password_hash,
        username: row.username,
      });
    } catch {
      return { ok: false, reason: "conflict" as const };
    }
  }

  await dbQuery(
    `
      UPDATE email_verification_tokens
      SET used_at = now()
      WHERE id = $1::uuid
    `,
    [row.id],
  );

  return { ok: true, reason: "verified" as const };
}
