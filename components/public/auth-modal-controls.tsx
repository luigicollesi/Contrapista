"use client";

import { AuthModal, type AuthMode } from "@/components/public/auth-modal";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

type AuthResponse = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
};

type Achievements = {
  total_matches_played: number;
  ranked_matches_played: number;
  total_matches_won: number;
  ranked_matches_won: number;
  ranked_rating: number;
  daily_problems_solved: number;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function signInWithProvider(provider: "google" | "github") {
  void signIn(provider, { callbackUrl: "/", redirect: true });
}

export function AuthModalControls() {
  const { data: session, status, update } = useSession();
  const closeAccountTimer = useRef<number | null>(null);
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [achievements, setAchievements] = useState<Achievements | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const isAuthenticated = status === "authenticated";
  const needsUsername = Boolean(session?.user?.needsUsername);

  function clearAccountCloseTimer() {
    if (closeAccountTimer.current !== null) {
      window.clearTimeout(closeAccountTimer.current);
      closeAccountTimer.current = null;
    }
  }

  function openAccountPreview() {
    clearAccountCloseTimer();
    setIsAccountOpen(true);
  }

  function scheduleAccountPreviewClose() {
    clearAccountCloseTimer();
    closeAccountTimer.current = window.setTimeout(() => {
      setIsAccountOpen(false);
      closeAccountTimer.current = null;
    }, 160);
  }

  function openModal(nextMode: AuthMode) {
    setMode(nextMode);
    setMessage("");
    setFieldErrors({});
  }

  function closeModal() {
    if (!isPending) {
      setMode(null);
      setMessage("");
      setFieldErrors({});
    }
  }

  function handleSubmit(formData: FormData) {
    setMessage("");
    setFieldErrors({});

    startTransition(async () => {
      const email = getFormValue(formData, "email");
      const password = getFormValue(formData, "password");

      if (mode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: getFormValue(formData, "username"),
            email,
            password,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as AuthResponse;

        if (!response.ok || !payload.ok) {
          setFieldErrors(payload.errors ?? {});
          setMessage(payload.message ?? "Não foi possível criar a conta.");
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setMessage("Email ou senha inválidos.");
        return;
      }

      setMode(null);
    });
  }

  function submitUsername(formData: FormData) {
    setMessage("");
    setFieldErrors({});

    startTransition(async () => {
      const response = await fetch("/api/auth/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: getFormValue(formData, "username") }),
      });
      const payload = (await response.json().catch(() => ({}))) as AuthResponse;

      if (!response.ok || !payload.ok) {
        setFieldErrors(payload.errors ?? {});
        setMessage(payload.message ?? "Não foi possível salvar o nome.");
        return;
      }

      setUsernameDraft("");
      await update();
    });
  }

  useEffect(() => {
    if (!isAccountOpen || achievements) {
      return;
    }

    let ignore = false;

    fetch("/api/users/me/achievements")
      .then((response) => response.json())
      .then((payload: { achievements?: Achievements }) => {
        if (!ignore && payload.achievements) {
          setAchievements(payload.achievements);
        }
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [achievements, isAccountOpen]);

  useEffect(() => {
    return () => {
      if (closeAccountTimer.current !== null) {
        window.clearTimeout(closeAccountTimer.current);
      }
    };
  }, []);

  if (isAuthenticated) {
    return (
      <div className="flex h-full flex-wrap items-center gap-2">
        <div
          className="relative flex h-full min-h-12 items-center"
          onBlur={(event) => {
            const nextTarget =
              event.relatedTarget instanceof Node ? event.relatedTarget : null;

            if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
              scheduleAccountPreviewClose();
            }
          }}
          onFocus={openAccountPreview}
          onMouseEnter={openAccountPreview}
          onMouseLeave={scheduleAccountPreviewClose}
        >
          <button
            aria-expanded={isAccountOpen}
            className="flex h-full max-w-48 items-center truncate rounded-sm px-3 py-2 text-sm font-bold text-stone-300 transition hover:bg-[#d0a85c]/10 hover:text-[#f5e7bd] focus:bg-[#d0a85c]/10 focus:text-[#f5e7bd] focus:outline-none"
            onClick={openAccountPreview}
            type="button"
          >
            {session.user?.name ?? "Escolha seu nome"}
          </button>
          {isAccountOpen ? (
            <div className="absolute right-0 top-full z-[70] mt-0 w-80 rounded-sm border border-[#d0a85c]/35 bg-[#121616] p-4 text-stone-100 shadow-2xl shadow-black/50">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d0a85c]">
                Perfil
              </p>
              <p className="mt-1 truncate font-serif text-2xl font-bold text-[#f2e6c8]">
                {session.user?.name ?? session.user?.email}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Partidas", achievements?.total_matches_played ?? 0],
                  ["Rankeadas", achievements?.ranked_matches_played ?? 0],
                  ["Vitórias", achievements?.total_matches_won ?? 0],
                  ["Vitórias R.", achievements?.ranked_matches_won ?? 0],
                  ["Rating", achievements?.ranked_rating ?? 1000],
                  ["Diários", achievements?.daily_problems_solved ?? 0],
                ].map(([label, value]) => (
                  <div
                    className="border-l border-[#d0a85c]/30 pl-2"
                    key={label}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
                      {label}
                    </p>
                    <p className="text-lg font-black text-[#f2e6c8]">{value}</p>
                  </div>
                ))}
              </div>
              <Link
                className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-sm bg-[#d0a85c] px-4 text-sm font-black uppercase tracking-[0.16em] text-[#17130d] transition hover:bg-[#f3dfaa]"
                href="/perfil"
              >
                Ir para perfil
              </Link>
            </div>
          ) : null}
        </div>
        <button
          className="inline-flex h-10 items-center justify-center rounded-sm border border-[#d0a85c]/45 px-4 text-sm font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
          onClick={() => void signOut({ redirect: false })}
          type="button"
        >
          Sair
        </button>
        {needsUsername ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-[90] flex min-h-dvh items-center justify-center bg-[#050606]/85 px-4 py-6 backdrop-blur-sm"
            role="dialog"
          >
            <form
              action={submitUsername}
              className="w-full max-w-md rounded-sm border border-[#d0a85c]/40 bg-[#121616] p-6 shadow-2xl shadow-black/60"
            >
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
                Nome público
              </p>
              <h2 className="mt-2 font-serif text-4xl font-bold text-[#f2e6c8]">
                Escolha seu nome
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-300">
                O nome do Google ou GitHub não será usado automaticamente. Crie
                um nome único para aparecer no Contrapista.
              </p>
              <label className="mt-6 block text-sm font-bold text-stone-200">
                Nome de usuário
                <input
                  className="mt-2 h-11 w-full rounded-sm border border-[#d0a85c]/30 bg-[#0e1111] px-3 text-stone-50 outline-none transition focus:border-[#d0a85c] focus:ring-2 focus:ring-[#d0a85c]/20"
                  name="username"
                  onChange={(event) => setUsernameDraft(event.target.value)}
                  required
                  type="text"
                  value={usernameDraft}
                />
                {fieldErrors.username ? (
                  <span className="mt-1 block text-xs font-semibold text-red-200">
                    {fieldErrors.username}
                  </span>
                ) : null}
              </label>
              {message ? (
                <p className="mt-4 rounded-sm border border-red-400/35 bg-red-950/25 px-3 py-2 text-sm text-red-100">
                  {message}
                </p>
              ) : null}
              <button
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-sm bg-[#d0a85c] px-4 text-sm font-black uppercase tracking-[0.18em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-wait disabled:opacity-70"
                disabled={isPending}
                type="submit"
              >
                {isPending ? "Salvando" : "Salvar nome"}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex h-10 items-center justify-center rounded-sm border border-[#d0a85c]/45 px-4 text-sm font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
          onClick={() => openModal("login")}
          type="button"
        >
          Login
        </button>
        <button
          className="inline-flex h-10 items-center justify-center rounded-sm bg-[#d0a85c] px-4 text-sm font-black text-[#17130d] transition hover:bg-[#f3dfaa]"
          onClick={() => openModal("register")}
          type="button"
        >
          Cadastro
        </button>
      </div>

      {mode ? (
        <AuthModal
          fieldErrors={fieldErrors}
          isPending={isPending}
          message={message}
          mode={mode}
          onClose={closeModal}
          onModeChange={openModal}
          onProviderSignIn={signInWithProvider}
          onSubmit={handleSubmit}
        />
      ) : null}
    </>
  );
}
