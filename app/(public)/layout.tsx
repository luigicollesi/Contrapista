import type { ReactNode } from "react";
import { AuthSessionProvider } from "@/components/public/auth-session-provider";
import { PublicHeader } from "@/components/public/public-header";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <AuthSessionProvider>
      <PublicHeader />
      {children}
    </AuthSessionProvider>
  );
}
