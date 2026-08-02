"use client";

import { ResponsiveSheet } from "@/components/rooms/responsive-sheet";
import { readJsonResponse, withCsrfHeader } from "@/lib/client-http";
import { signOut } from "next-auth/react";
import { useEffect, useId, useState, useTransition } from "react";

type ChallengeResponse = {
  challengeId?: string;
  code?: string;
  expiresAt?: number;
  message?: string;
  ok?: boolean;
};

type DeleteResponse = {
  message?: string;
  ok?: boolean;
};

function formatExpiration(expiresAt: number | null) {
  if (!expiresAt) {
    return "";
  }

  return new Date(expiresAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DeleteAccountPanel() {
  const titleId = useId();
  const [challengeId, setChallengeId] = useState("");
  const [challengeCode, setChallengeCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [isPending, startTransition] = useTransition();
  const hasChallenge = Boolean(challengeCode && challengeId);
  const remainingSeconds = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - now) / 1000))
    : 0;
  const canDelete =
    hasChallenge && remainingSeconds > 0 && confirmationCode.trim() === challengeCode;

  useEffect(() => {
    if (!isModalOpen || !expiresAt) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 250);

    return () => window.clearInterval(interval);
  }, [expiresAt, isModalOpen]);

  function resetChallenge() {
    setChallengeId("");
    setChallengeCode("");
    setConfirmationCode("");
    setExpiresAt(null);
    setMessage("");
  }

  function closeModal() {
    if (isPending) {
      return;
    }

    setIsModalOpen(false);
    resetChallenge();
  }

  function requestChallenge() {
    setMessage("");
    setConfirmationCode("");
    setIsModalOpen(true);

    startTransition(async () => {
      const response = await fetch("/api/users/me");
      const payload = await readJsonResponse<ChallengeResponse>(response);

      if (!response.ok || !payload.ok || !payload.code || !payload.challengeId) {
        setMessage(payload.message ?? "Não deu para gerar o código.");
        return;
      }

      setChallengeId(payload.challengeId);
      setChallengeCode(payload.code);
      setExpiresAt(payload.expiresAt ?? null);
      setNow(Date.now());
    });
  }

  function deleteAccount() {
    if (!canDelete) {
      return;
    }

    setMessage("");

    startTransition(async () => {
      const response = await fetch(
        "/api/users/me",
        withCsrfHeader({
          body: JSON.stringify({
            challengeId,
            confirmationCode: confirmationCode.trim(),
          }),
          headers: { "Content-Type": "application/json" },
          method: "DELETE",
        }),
      );
      const payload = await readJsonResponse<DeleteResponse>(response);

      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? "Não deu para excluir a conta.");
        return;
      }

      await signOut({ callbackUrl: "/", redirect: true });
    });
  }

  return (
    <section className="mt-10 rounded-sm border border-[#8b1e1e]/45 bg-[#171a1a] p-5 shadow-2xl shadow-black/20 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-300">
        Zona de risco
      </p>
      <h2 className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]">
        Excluir conta
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300">
        Isso apaga sua conta e os dados ligados a ela. Se você estiver em uma
        sala, o sistema tira você da mesa antes de concluir.
      </p>

      <button
        className="mt-5 inline-flex h-11 items-center justify-center rounded-sm border border-[#8b1e1e]/60 bg-[#8b1e1e] px-5 text-sm font-black uppercase tracking-[0.16em] text-red-50 transition hover:bg-[#a32929] disabled:cursor-wait disabled:opacity-70"
        disabled={isPending}
        onClick={requestChallenge}
        type="button"
      >
        {isPending ? "Gerando" : "Excluir conta"}
      </button>

      {message ? (
        <p className="mt-4 rounded-sm border border-red-400/35 bg-red-950/25 px-3 py-2 text-sm text-red-100">
          {message}
        </p>
      ) : null}

      {isModalOpen ? (
        <ResponsiveSheet
          ariaLabelledBy={titleId}
          backdropClassName="bg-[#050606]/85 backdrop-blur-sm"
          className="items-center px-3 py-4 sm:px-4 sm:py-6"
          contentClassName="w-[min(calc(100vw-1.5rem),34rem)] rounded-sm border border-[#8b1e1e]/55 bg-[#121616] p-5 text-stone-50 shadow-black/60 sm:p-6"
          role="alertdialog"
          zIndexClassName="z-[90]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-300">
                Confirmação final
              </p>
              <h2
                className="mt-2 font-serif text-3xl font-bold text-[#f2e6c8]"
                id={titleId}
              >
                Excluir sua conta
              </h2>
            </div>
            <button
              aria-label="Fechar exclusão de conta"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-stone-600 text-lg font-bold text-stone-200 transition hover:border-[#d0a85c] hover:text-[#f5e7bd]"
              disabled={isPending}
              onClick={closeModal}
              type="button"
            >
              X
            </button>
          </div>

          <p className="mt-4 rounded-sm border border-red-400/35 bg-red-950/25 px-3 py-2 text-sm font-semibold leading-6 text-red-100">
            Você tem 30 segundos para digitar o código. Depois disso, a tela não
            aceita mais a confirmação. O servidor guarda o código por 40
            segundos.
          </p>

          <div className="mt-5 rounded-sm border border-[#d0a85c]/25 bg-[#0e1111] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d0a85c]">
              Código
              </p>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-red-200">
                {remainingSeconds}s
              </p>
            </div>
            <p className="mt-3 break-all font-mono text-sm font-bold leading-6 text-[#f2e6c8] sm:text-base">
              {challengeCode || "Gerando código..."}
            </p>
            {expiresAt ? (
              <p className="mt-2 text-xs font-semibold text-stone-400">
                Válido na tela até {formatExpiration(expiresAt)}.
              </p>
            ) : null}
          </div>

          <label className="mt-5 block text-sm font-bold text-stone-200">
            Digite o código acima para confirmar
            <input
              autoComplete="off"
              className="mt-2 h-12 w-full rounded-sm border border-[#d0a85c]/30 bg-[#0e1111] px-3 font-mono text-sm text-stone-50 outline-none transition placeholder:text-stone-600 focus:border-[#d0a85c] focus:ring-2 focus:ring-[#d0a85c]/20"
              disabled={!hasChallenge || remainingSeconds <= 0 || isPending}
              onChange={(event) =>
                setConfirmationCode(event.target.value.trim().toLowerCase())
              }
              spellCheck={false}
              value={confirmationCode}
            />
          </label>

          {message ? (
            <p className="mt-4 rounded-sm border border-red-400/35 bg-red-950/25 px-3 py-2 text-sm text-red-100">
              {message}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              className="inline-flex h-11 items-center justify-center rounded-sm border border-[#8b1e1e]/60 bg-[#8b1e1e] px-5 text-sm font-black uppercase tracking-[0.16em] text-red-50 transition hover:bg-[#a32929] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canDelete || isPending}
              onClick={deleteAccount}
              type="button"
            >
              {isPending ? "Excluindo" : "Confirmar exclusão"}
            </button>
            <button
              className="inline-flex h-11 items-center justify-center rounded-sm border border-[#d0a85c]/35 px-5 text-sm font-bold text-[#f5e7bd] transition hover:bg-[#d0a85c]/10 disabled:cursor-wait disabled:opacity-70"
              disabled={isPending}
              onClick={closeModal}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </ResponsiveSheet>
      ) : null}
    </section>
  );
}
