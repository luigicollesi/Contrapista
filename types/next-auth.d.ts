import "next-auth";
import type { AuthProvider } from "@/lib/auth-users";

declare module "next-auth" {
  interface User {
    provider?: AuthProvider;
    needsUsername?: boolean;
  }

  interface Session {
    user?: {
      id?: string;
      provider?: AuthProvider;
      needsUsername?: boolean;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    provider?: AuthProvider;
    needsUsername?: boolean;
  }
}
