"use client";

import { useEffect, useId } from "react";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";

export type AuthMode = "login" | "register";

type AuthModalProps = {
  fieldErrors: Record<string, string>;
  isPending: boolean;
  message: string;
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  onProviderSignIn: (provider: "google" | "github") => void;
  onSubmit: (formData: FormData) => void;
};

const modalCopy = {
  login: {
    eyebrow: "Retorno ao arquivo",
    title: "Entrar na conta",
    body: "Acesse seu perfil para acompanhar histórico, casos e recursos da mesa pública.",
    submit: "Entrar",
    switchMode: "Ainda não tenho conta",
  },
  register: {
    eyebrow: "Novo investigador",
    title: "Criar conta",
    body: "Reserve seu acesso ao Contrapista e prepare a base para recursos persistentes da conta.",
    submit: "Criar conta",
    switchMode: "Já tenho uma conta",
  },
} satisfies Record<
  AuthMode,
  {
    body: string;
    eyebrow: string;
    submit: string;
    switchMode: string;
    title: string;
  }
>;

function FieldError({ children }: { children?: string }) {
  return children ? (
    <span className="mt-1 block text-xs font-semibold text-red-200">
      {children}
    </span>
  ) : null;
}

function TextField({
  autoComplete,
  error,
  label,
  name,
  type,
}: {
  autoComplete: string;
  error?: string;
  label: string;
  name: string;
  type: "email" | "password" | "text";
}) {
  return (
    <label className="block text-sm font-bold text-stone-200">
      {label}
      <input
        autoComplete={autoComplete}
        className="mt-2 h-12 w-full rounded-sm border border-[#d0a85c]/30 bg-[#0e1111] px-3 text-base text-stone-50 outline-none transition placeholder:text-stone-600 focus:border-[#d0a85c] focus:ring-2 focus:ring-[#d0a85c]/20 sm:h-11 sm:text-sm"
        name={name}
        required
        type={type}
      />
      <FieldError>{error}</FieldError>
    </label>
  );
}

function ProviderButton({
  children,
  disabled,
  onClick,
  tone,
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
  tone: "light" | "dark";
}) {
  const className =
    tone === "light"
      ? "border-stone-300 bg-stone-50 text-[#17130d] hover:bg-white"
      : "border-stone-600 bg-[#0e1111] text-stone-50 hover:border-[#d0a85c] hover:text-[#f5e7bd]";

  return (
    <button
      className={`inline-flex h-12 w-full items-center justify-center rounded-sm border px-4 text-sm font-black transition disabled:cursor-wait disabled:opacity-70 sm:h-11 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function AuthModal({
  fieldErrors,
  isPending,
  message,
  mode,
  onClose,
  onModeChange,
  onProviderSignIn,
  onSubmit,
}: AuthModalProps) {
  const titleId = useId();
  const copy = modalCopy[mode];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPending) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPending, onClose]);

  return (
    <ResponsiveSheet
      ariaLabelledBy={titleId}
      backdropClassName="bg-[#050606]/85 backdrop-blur-sm"
      contentClassName="relative grid max-w-5xl border border-[#d0a85c]/40 bg-[#101414] shadow-black/60 lg:grid-cols-[0.86fr_1.14fr]"
      zIndexClassName="z-[80]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(208,168,92,0.16),transparent_42%),linear-gradient(135deg,rgba(124,31,42,0.18),transparent_38%)]" />
      <div className="relative grid lg:grid-cols-[0.86fr_1.14fr]">
        <aside className="hidden border-r border-[#d0a85c]/20 bg-[#171a1a] p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d0a85c]">
              Contrapista
            </p>
            <h2 className="mt-5 font-serif text-4xl font-bold leading-tight text-[#f2e6c8]">
              Toda conta abre um novo arquivo.
            </h2>
            <p className="mt-5 text-sm leading-7 text-stone-300">
              Entre para manter seu acesso pronto enquanto a experiência pública
              evolui para histórico de casos, perfis e mesas persistentes.
            </p>
          </div>
          <div className="mt-10 space-y-3 border-t border-[#d0a85c]/20 pt-6 text-sm text-stone-300">
            <p className="font-bold text-[#f5e7bd]">Acesso seguro</p>
            <p className="leading-7">
              Use email e senha ou continue com provedores OAuth configurados no
              Auth.js.
            </p>
          </div>
        </aside>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-7 lg:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d0a85c]">
                {copy.eyebrow}
              </p>
              <h2
                className="mt-2 font-serif text-3xl font-bold leading-tight text-[#f2e6c8] sm:text-4xl"
                id={titleId}
              >
                {copy.title}
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-stone-300 sm:leading-7">
                {copy.body}
              </p>
            </div>
            <button
              aria-label="Fechar modal"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-stone-600 text-lg font-bold text-stone-200 transition hover:border-[#d0a85c] hover:text-[#f5e7bd] sm:h-10 sm:w-10"
              disabled={isPending}
              onClick={onClose}
              type="button"
            >
              X
            </button>
          </div>

          <div className="mt-5 grid gap-2 sm:mt-7 sm:grid-cols-2">
            <ProviderButton
              disabled={isPending}
              onClick={() => onProviderSignIn("google")}
              tone="light"
            >
              Continuar com Google
            </ProviderButton>
            <ProviderButton
              disabled={isPending}
              onClick={() => onProviderSignIn("github")}
              tone="dark"
            >
              Continuar com GitHub
            </ProviderButton>
          </div>

          <div className="mt-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
            <span className="h-px flex-1 bg-stone-700" />
            <span>Email e senha</span>
            <span className="h-px flex-1 bg-stone-700" />
          </div>

          <form action={onSubmit} className="mt-5 space-y-4 sm:mt-6">
            {mode === "register" ? (
              <TextField
                autoComplete="name"
                error={fieldErrors.username ?? fieldErrors.name}
                label="Nome de usuário"
                name="username"
                type="text"
              />
            ) : null}

            <TextField
              autoComplete="email"
              error={fieldErrors.email}
              label="Email"
              name="email"
              type="email"
            />
            <TextField
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              error={fieldErrors.password}
              label="Senha"
              name="password"
              type="password"
            />

            {message ? (
              <p className="rounded-sm border border-red-400/35 bg-red-950/25 px-3 py-2 text-sm text-red-100">
                {message}
              </p>
            ) : null}

            <button
              className="inline-flex h-12 w-full items-center justify-center rounded-sm bg-[#d0a85c] px-4 text-sm font-black uppercase tracking-[0.18em] text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-wait disabled:opacity-70 sm:h-11"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Processando" : copy.submit}
            </button>
          </form>

          <button
            className="mt-5 text-sm font-bold text-[#f5e7bd] underline-offset-4 hover:underline"
            disabled={isPending}
            onClick={() =>
              onModeChange(mode === "login" ? "register" : "login")
            }
            type="button"
          >
            {copy.switchMode}
          </button>
        </div>
      </div>
    </ResponsiveSheet>
  );
}
