import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import {
  authenticateUser,
  getUserById,
  getOrCreateOAuthUser,
  isAuthProvider,
  validateAuthInput,
} from "@/lib/auth-users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV === "production"
      ? undefined
      : "contrapista-dev-auth-secret-change-me"),
  session: {
    strategy: "jwt",
  },
  pages: {
    error: "/auth/error",
    signIn: "/auth/entrar",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = validateAuthInput({
          email: credentials?.email,
          password: credentials?.password,
        });

        if (!parsed.ok) {
          return null;
        }

        return authenticateUser(parsed.data.email, parsed.data.password);
      },
    }),
  ],
  callbacks: {
    async signIn({ account, user }) {
      const provider = account?.provider;

      if (provider === "google" || provider === "github") {
        if (!user.email) {
          return false;
        }

        const authUser = await getOrCreateOAuthUser({
          email: user.email,
          provider,
        });

        return Boolean(authUser);
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (account?.provider === "google" || account?.provider === "github") {
        const email = typeof token.email === "string" ? token.email : user?.email;
        const authUser = email
          ? await getOrCreateOAuthUser({
              email,
              provider: account.provider,
            })
          : null;

        if (authUser) {
          token.id = authUser.id;
          token.name = authUser.username ?? undefined;
          token.provider = authUser.provider;
          token.needsUsername = authUser.needsUsername;
        }
      } else if (user?.id) {
        token.id = user.id;
        token.name = user.name;
        token.provider =
          "provider" in user && isAuthProvider(user.provider)
            ? user.provider
            : "credentials";
        token.needsUsername =
          "needsUsername" in user ? Boolean(user.needsUsername) : false;
      } else if (typeof token.id === "string") {
        const authUser = await getUserById(token.id);

        if (authUser) {
          token.name = authUser.username;
          token.provider = authUser.provider;
          token.needsUsername = !authUser.username;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
        session.user.name = typeof token.name === "string" ? token.name : null;
        session.user.provider = isAuthProvider(token.provider)
          ? token.provider
          : undefined;
        session.user.needsUsername = Boolean(token.needsUsername);
      }

      return session;
    },
  },
});
