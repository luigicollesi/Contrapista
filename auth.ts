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
import {
  AUTH_SECRET,
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_COOKIE_OPTIONS,
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_SESSION_UPDATE_AGE_SECONDS,
} from "@/lib/auth-config";

function getAuthRouteBaseUrl() {
  const configured =
    process.env.AUTH_REDIRECT_PROXY_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    return undefined;
  }

  try {
    const url = new URL(configured);
    url.pathname = url.pathname.replace(/\/+$/, "");

    if (!url.pathname.endsWith("/api/auth")) {
      url.pathname = `${url.pathname}/api/auth`.replace(/\/{2,}/g, "/");
    }

    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

const authRouteBaseUrl = getAuthRouteBaseUrl();

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: AUTH_SECRET,
  trustHost: true,
  redirectProxyUrl: authRouteBaseUrl,
  session: {
    strategy: "jwt",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    updateAge: AUTH_SESSION_UPDATE_AGE_SECONDS,
  },
  jwt: {
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  },
  cookies: {
    sessionToken: {
      name: AUTH_SESSION_COOKIE_NAME,
      options: AUTH_SESSION_COOKIE_OPTIONS,
    },
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
          token.name =
            authUser.username &&
            authUser.terms_accepted &&
            authUser.privacy_acknowledged
              ? authUser.username
              : null;
          token.provider = authUser.provider;
          token.needsUsername =
            !authUser.username ||
            !authUser.terms_accepted ||
            !authUser.privacy_acknowledged;
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
