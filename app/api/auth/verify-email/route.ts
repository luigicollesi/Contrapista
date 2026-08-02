import { verifyEmailToken } from "@/lib/email-verification";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim() ?? "";
  const result = await verifyEmailToken(token);
  const redirectUrl = new URL("/", origin);

  redirectUrl.searchParams.set(
    "emailVerified",
    result.ok ? "success" : "invalid",
  );

  return Response.redirect(redirectUrl);
}
