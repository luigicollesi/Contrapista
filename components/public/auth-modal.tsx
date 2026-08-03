"use client";

import { useEffect, useId } from "react";
import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";
import Link from "next/link";

export type AuthMode = "login" | "register";
export type AuthFormValues = {
  email: string;
  password: string;
  termsAccepted: boolean;
  username: string;
};

type AuthModalProps = {
  fieldErrors: Record<string, string>;
  formValues: AuthFormValues;
  isPending: boolean;
  message: string;
  mode: AuthMode;
  onClose: () => void;
  onFieldChange: (
    field: keyof AuthFormValues,
    value: string | boolean,
  ) => void;
  onModeChange: (mode: AuthMode) => void;
  onProviderSignIn: (provider: "google" | "github") => void;
  onSubmit: (formData: FormData) => void;
};

const modalCopy = {
  login: {
    eyebrow: "Acesso",
    title: "Entre para jogar",
    body: "Acesse suas partidas, entre nas filas e acompanhe seu desempenho no Contrapista.",
    submit: "Entrar",
    switchMode: "Criar uma nova conta",
  },
  register: {
    eyebrow: "Cadastro",
    title: "Comece sua investigação",
    body: "Escolha um nome, confirme seu email e participe das partidas com seu próprio histórico.",
    submit: "Criar conta",
    switchMode: "Entrar com minha conta",
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
  onChange,
  type,
  value,
}: {
  autoComplete: string;
  error?: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  type: "email" | "password" | "text";
  value: string;
}) {
  return (
    <label className="block text-sm font-bold text-stone-200">
      {label}
      <input
        autoComplete={autoComplete}
        className="mt-2 h-12 w-full rounded-sm border border-[#d0a85c]/30 bg-[#0e1111] px-3 text-base text-stone-50 outline-none transition placeholder:text-stone-600 focus:border-[#d0a85c] focus:ring-2 focus:ring-[#d0a85c]/20 sm:h-11 sm:text-sm"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        required
        type={type}
        value={value}
      />
      <FieldError>{error}</FieldError>
    </label>
  );
}

export function TermsAcceptance({
  checked,
  error,
  onChange,
}: {
  checked?: boolean;
  error?: string;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex gap-3 rounded-sm border border-[#d0a85c]/25 bg-[#0e1111]/70 p-3 text-sm leading-6 text-stone-300">
      <input
        checked={checked}
        className="mt-1 h-4 w-4 shrink-0 accent-[#d0a85c]"
        name="termsAccepted"
        onChange={(event) => onChange?.(event.target.checked)}
        required
        type="checkbox"
        value="true"
      />
      <span>
        Li e aceito os{" "}
        <Link
          className="font-bold text-[#f5e7bd] underline-offset-4 hover:underline"
          href="/termos"
        >
          Termos de Uso
        </Link>{" "}
        e estou ciente da{" "}
        <Link
          className="font-bold text-[#f5e7bd] underline-offset-4 hover:underline"
          href="/privacidade"
        >
          Política de Privacidade
        </Link>{" "}
        do Contrapista.
        <FieldError>{error}</FieldError>
      </span>
    </label>
  );
}

function PasswordRequirement({
  isMet,
  text,
}: {
  isMet: boolean;
  text: string;
}) {
  return (
    <li
      className={`flex items-center gap-2 ${
        isMet ? "text-emerald-200" : "text-stone-400"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black ${
          isMet ? "bg-emerald-700 text-white" : "bg-stone-700 text-stone-300"
        }`}
      >
        {isMet ? "✓" : "·"}
      </span>
      {text}
    </li>
  );
}

function PasswordRequirements({ password }: { password: string }) {
  const requirements = [
    { isMet: password.length >= 8, text: "Pelo menos 8 caracteres" },
    { isMet: /[A-Za-z]/.test(password), text: "Ao menos uma letra" },
    { isMet: /[0-9]/.test(password), text: "Ao menos um número" },
  ];

  return (
    <div className="rounded-sm border border-[#d0a85c]/20 bg-[#0e1111]/60 px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#d0a85c]">
        Requisitos da senha
      </p>
      <ul className="mt-2 grid gap-1 text-xs font-semibold">
        {requirements.map((requirement) => (
          <PasswordRequirement
            isMet={requirement.isMet}
            key={requirement.text}
            text={requirement.text}
          />
        ))}
      </ul>
    </div>
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
  formValues,
  isPending,
  message,
  mode,
  onClose,
  onFieldChange,
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
      contentClassName="relative max-w-[58rem] overflow-hidden border border-[#d0a85c]/40 bg-[#101414] shadow-black/60"
      zIndexClassName="z-[80]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(208,168,92,0.16),transparent_42%),linear-gradient(135deg,rgba(124,31,42,0.18),transparent_38%)]" />
      <div className="relative grid lg:min-h-[34rem] lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="hidden border-r border-[#d0a85c]/20 bg-[#171a1a] p-8 lg:flex lg:flex-col lg:justify-between xl:p-9">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d0a85c]">
              Contrapista
            </p>
            <h2 className="mt-5 font-serif text-4xl font-bold leading-tight text-[#f2e6c8]">
              Jogue com um nome reconhecível em cada mesa.
            </h2>
            <p className="mt-5 text-sm leading-7 text-stone-300">
              Entre com email e senha, Google ou GitHub. Seu nome público será
              usado nas salas, filas e resultados.
            </p>
          </div>
          <div className="mt-10 space-y-3 border-t border-[#d0a85c]/20 pt-6 text-sm text-stone-300">
            <p className="font-bold text-[#f5e7bd]">Pronto para disputar</p>
            <p className="leading-7">
              Use sua conta para entrar em filas, participar de salas e revisar
              partidas anteriores.
            </p>
          </div>
        </aside>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-7 lg:p-8 xl:p-9">
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
                label="Nome público"
                name="username"
                onChange={(value) => onFieldChange("username", value)}
                type="text"
                value={formValues.username}
              />
            ) : null}

            <TextField
              autoComplete="email"
              error={fieldErrors.email}
              label="Email"
              name="email"
              onChange={(value) => onFieldChange("email", value)}
              type="email"
              value={formValues.email}
            />
            <TextField
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              error={fieldErrors.password}
              label="Senha"
              name="password"
              onChange={(value) => onFieldChange("password", value)}
              type="password"
              value={formValues.password}
            />

            {mode === "register" ? (
              <PasswordRequirements password={formValues.password} />
            ) : null}

            {mode === "register" ? (
              <TermsAcceptance
                checked={formValues.termsAccepted}
                error={fieldErrors.terms}
                onChange={(checked) => onFieldChange("termsAccepted", checked)}
              />
            ) : null}

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
