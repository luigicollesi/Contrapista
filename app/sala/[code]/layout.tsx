import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata(
  "Sala privada",
  "Mesa temporária do Contrapista.",
);

export default async function RoomLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ code: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    const { code } = await params;
    redirect(`/auth/entrar?callbackUrl=${encodeURIComponent(`/sala/${code}`)}`);
  }

  return children;
}
