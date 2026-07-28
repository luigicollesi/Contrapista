"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const steps = [
  "Reunindo depoimentos",
  "Cruzando pistas",
  "Montando 14 locais",
  "Escrevendo solucao",
];

export default function CreatingCasePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStepIndex((current) => (current + 1) % steps.length);
    }, 1700);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function startCaseCreation() {
      try {
        const response = await fetch(`/api/rooms/${code}/case/start`, {
          method: "POST",
        });
        const data = await response.json();

        if (!isActive) {
          return;
        }

        if (!response.ok) {
          throw new Error(data.error ?? "Nao foi possivel criar o caso.");
        }

        router.replace(`/sala/${code}/jogo`);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Nao foi possivel criar o caso.",
        );
      }
    }

    startCaseCreation();

    return () => {
      isActive = false;
    };
  }, [code, router]);

  return (
    <main className="sy-theme relative flex min-h-screen items-center justify-center overflow-hidden bg-[#10130f] px-6 py-10 text-stone-50">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <section className="relative grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[.95fr_1.05fr]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d7b861]">
            Sala {code}
          </p>
          <h1 className="mt-5 max-w-2xl font-serif text-5xl font-bold leading-tight text-[#fff3cf] sm:text-6xl">
            A central esta montando um caso inedito.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-stone-300">
            A IA esta preparando a narrativa, as pistas por local e a solucao
            final. Esta etapa pode levar alguns instantes.
          </p>

          <div className="mt-8 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-5 shadow-2xl shadow-black/25">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
              Status atual
            </p>
            <div className="mt-4 flex items-center gap-4">
              <span className="relative flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d7b861] opacity-75" />
                <span className="relative inline-flex h-4 w-4 rounded-full bg-[#d7b861]" />
              </span>
              <p className="text-xl font-bold text-[#fff3cf]">
                {steps[stepIndex]}
              </p>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#0f120e]">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-[#d7b861]" />
            </div>
          </div>

          {error ? (
            <p className="mt-6 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
              {error}
            </p>
          ) : null}
        </div>

        <div className="relative min-h-[460px]">
          <div className="absolute inset-x-8 top-0 h-24 rounded-full bg-[#d7b861]/20 blur-3xl" />
          <div className="relative mx-auto h-[460px] max-w-md rounded-lg border border-[#d7b861]/40 bg-[#171b16] p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between border-b border-[#d7b861]/25 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">
                  Case file
                </p>
                <p className="mt-1 font-mono text-sm text-stone-400">
                  #{code}-AI
                </p>
              </div>
              <div className="h-12 w-12 rounded-lg border border-[#d7b861]/40 bg-[#0f120e]" />
            </div>

            <div className="relative mt-6 overflow-hidden rounded-lg border border-stone-700 bg-[#0f120e] p-5">
              <div className="absolute inset-x-0 top-0 h-16 animate-[pulse_1.6s_ease-in-out_infinite] bg-gradient-to-b from-[#d7b861]/25 to-transparent" />
              <div className="space-y-4">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div className="flex items-center gap-3" key={index}>
                    <span className="h-3 w-3 rounded-full bg-[#d7b861]" />
                    <span
                      className="h-3 rounded-full bg-stone-600"
                      style={{ width: `${42 + ((index * 17) % 44)}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              {["Museu", "Banco", "Docas", "Parque"].map((label) => (
                <div
                  className="rounded-lg border border-stone-700 bg-[#0f120e] px-3 py-4"
                  key={label}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    Pista
                  </p>
                  <p className="mt-1 font-bold text-stone-200">{label}</p>
                </div>
              ))}
            </div>

            <div className="absolute -bottom-5 left-1/2 h-10 w-52 -translate-x-1/2 rounded-full bg-black/30 blur-xl" />
          </div>
        </div>
      </section>
    </main>
  );
}
