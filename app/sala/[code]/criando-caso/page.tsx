"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const steps = [
  "Reunindo depoimentos",
  "Catalogando suspeitos",
  "Verificando álibis",
  "Localizando contradições",
  "Cruzando pistas",
  "Separando falsas pistas",
  "Distribuindo fragmentos",
  "Criando charadas",
  "Escrevendo solução",
  "Lacrando o arquivo",
];

const boardPins = [
  { left: "18%", top: "22%", delay: "0s" },
  { left: "52%", top: "14%", delay: ".35s" },
  { left: "78%", top: "38%", delay: ".7s" },
  { left: "34%", top: "74%", delay: "1.05s" },
  { left: "70%", top: "78%", delay: "1.4s" },
  { left: "18%", top: "58%", delay: "1.75s" },
];

const clueCards = [
  { label: "Depoimento", left: "7%", top: "6%", rotate: "-5deg" },
  { label: "Horário", left: "58%", top: "5%", rotate: "4deg" },
  { label: "Objeto", left: "63%", top: "67%", rotate: "-3deg" },
  { label: "Álibi", left: "8%", top: "72%", rotate: "5deg" },
];

export default function CreatingCasePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params.code;
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const progress = ((stepIndex + 1) / steps.length) * 100;

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
          throw new Error(data.error ?? "Não foi possível criar o caso.");
        }

        router.replace(`/sala/${code}/jogo`);
      } catch (caughtError) {
        if (!isActive) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Não foi possível criar o caso.",
        );
      }
    }

    startCaseCreation();

    return () => {
      isActive = false;
    };
  }, [code, router]);

  return (
    <main className="sy-theme relative min-h-screen overflow-hidden bg-[#10130f] px-4 py-8 text-stone-50 sm:px-6 lg:py-10">
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="case-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-[#d7b861]/10 to-transparent" />
        <div className="case-fog case-fog-a absolute left-[-12%] top-[12%] h-40 w-[38rem] rotate-[-12deg] rounded-full border border-[#d7b861]/20" />
        <div className="case-fog case-fog-b absolute bottom-[10%] right-[-10%] h-56 w-[44rem] rotate-[10deg] rounded-full border border-[#8b1e1e]/25" />
        <div className="case-ticker absolute bottom-8 left-0 flex min-w-full gap-6 font-mono text-xs font-bold uppercase tracking-[0.32em] text-[#d7b861]/35">
          {Array.from({ length: 10 }).map((_, index) => (
            <span key={index}>Pistas em análise</span>
          ))}
        </div>
      </div>
      <section className="relative mx-auto grid w-full max-w-7xl items-center gap-8 lg:grid-cols-[.82fr_1.18fr] lg:gap-12">
        <div className="mx-auto w-full max-w-2xl lg:mx-0">
          <p className="text-sm font-bold uppercase tracking-[0.32em] text-[#d7b861]">
            Sala {code}
          </p>
          <h1 className="mt-5 max-w-2xl font-serif text-4xl font-bold leading-tight text-[#fff3cf] sm:text-6xl">
            A central está montando um caso inédito.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-stone-300">
            A IA está preparando a narrativa, as pistas por local e a solução
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
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8b1e1e] via-[#d7b861] to-[#fff3cf] transition-[width] duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {steps.map((step, index) => (
                <span
                  aria-label={step}
                  className={`h-2 rounded-full transition ${
                    index <= stepIndex ? "bg-[#d7b861]" : "bg-stone-800"
                  }`}
                  key={step}
                  title={step}
                />
              ))}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {steps.map((step, index) => (
                <div
                  className={`flex items-center gap-2 text-sm ${
                    index === stepIndex
                      ? "font-bold text-[#fff3cf]"
                      : index < stepIndex
                        ? "text-[#d7b861]"
                        : "text-stone-500"
                  }`}
                  key={step}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      index <= stepIndex ? "bg-[#d7b861]" : "bg-stone-700"
                    }`}
                  />
                  {step}
                </div>
              ))}
            </div>
          </div>

          {error ? (
            <p className="mt-6 rounded-lg border border-red-400/30 bg-red-950/50 px-4 py-3 text-sm font-medium text-red-100">
              {error}
            </p>
          ) : null}
        </div>

        <div className="relative min-h-[620px] w-full sm:min-h-[680px] lg:min-h-[640px]">
          <div className="case-board-glow absolute inset-x-4 top-0 h-28 rounded-full bg-[#d7b861]/20 blur-3xl sm:inset-x-14" />
          <div className="relative mx-auto flex min-h-[620px] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#d7b861]/40 bg-[#171b16] p-4 shadow-2xl shadow-black/40 sm:min-h-[680px] sm:p-6 lg:min-h-[640px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(215,184,97,.16),transparent_18%),radial-gradient(circle_at_80%_70%,rgba(139,30,30,.18),transparent_22%)]" />
            <div className="case-map-lines absolute inset-0 opacity-35" />
            <div className="case-scan-line absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#d7b861]/20 to-transparent" />
            <div className="relative z-10 flex items-center justify-between border-b border-[#d7b861]/25 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#d7b861]">
                  Case file
                </p>
                <p className="mt-1 font-mono text-sm text-stone-400">
                  #{code}-AI
                </p>
              </div>
              <div className="case-seal h-12 w-12 rounded-lg border border-[#d7b861]/40 bg-[#0f120e]" />
            </div>

            <div className="relative z-10 mt-5 overflow-hidden rounded-lg border border-stone-700 bg-[#0f120e] p-4 sm:p-5">
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

            <div className="relative z-10 mt-6 min-h-[300px] flex-1 overflow-hidden rounded-lg border border-[#d7b861]/30 bg-[#0f120e]/80 sm:min-h-[360px]">
              <svg
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <path
                  className="case-thread"
                  d="M18 22 L52 14 L78 38 L70 78 L34 74 L18 58 L18 22"
                  fill="none"
                  pathLength={100}
                  stroke="#d7b861"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.35"
                />
                <path
                  className="case-thread case-thread-alt"
                  d="M18 22 L34 74 M52 14 L34 74 M78 38 L18 58 M70 78 L52 14"
                  fill="none"
                  pathLength={100}
                  stroke="#8b1e1e"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.1"
                />
                <path
                  className="case-thread case-thread-soft"
                  d="M18 58 C34 34 54 46 78 38 M34 74 C48 58 62 56 70 78"
                  fill="none"
                  pathLength={100}
                  stroke="#fff3cf"
                  strokeLinecap="round"
                  strokeWidth="0.75"
                />
              </svg>
              {boardPins.map((pin, index) => (
                <span
                  className="case-pin absolute z-20 h-4 w-4 rounded-full bg-[#d7b861] shadow-[0_0_18px_rgba(215,184,97,.75)]"
                  key={`${pin.left}-${pin.top}`}
                  style={{
                    left: pin.left,
                    top: pin.top,
                    animationDelay: pin.delay,
                  }}
                >
                  <span className="absolute inset-[-7px] rounded-full border border-[#d7b861]/45" />
                  <span className="sr-only">Ponto {index + 1}</span>
                </span>
              ))}
              {clueCards.map((card, index) => (
                <div
                  className="case-floating-card absolute z-30 w-28 rounded border border-[#d7b861]/35 bg-[#fff3cf] px-3 py-2 text-[#21170f] shadow-lg sm:w-32"
                  key={card.label}
                  style={{
                    left: card.left,
                    top: card.top,
                    rotate: card.rotate,
                    animationDelay: `${index * 0.45}s`,
                  }}
                >
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#8b1e1e]">
                    {card.label}
                  </p>
                  <div className="mt-1 h-1.5 w-16 rounded-full bg-[#6f5533]/35" />
                </div>
              ))}
            </div>

            <div className="relative z-10 mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["Álibi", "Ruído", "Rastro", "Versão"].map((label, index) => (
                <div
                  className="case-location-tile rounded-lg border border-stone-700 bg-[#0f120e] px-3 py-4"
                  key={label}
                  style={{ animationDelay: `${index * 0.22}s` }}
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
      <style jsx>{`
        @keyframes case-sweep {
          0% {
            transform: translateX(-120%) skewX(-10deg);
          }
          100% {
            transform: translateX(360%) skewX(-10deg);
          }
        }

        @keyframes case-fog {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(var(--case-rotate, 0deg));
            opacity: 0.35;
          }
          50% {
            transform: translate3d(26px, -18px, 0)
              rotate(var(--case-rotate, 0deg));
            opacity: 0.75;
          }
        }

        @keyframes case-ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        @keyframes case-scan-line {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(620%);
          }
        }

        @keyframes case-seal {
          0%,
          100% {
            box-shadow: inset 0 0 0 1px rgba(215, 184, 97, 0.2),
              0 0 0 rgba(215, 184, 97, 0);
          }
          50% {
            box-shadow: inset 0 0 0 1px rgba(215, 184, 97, 0.55),
              0 0 24px rgba(215, 184, 97, 0.22);
          }
        }

        @keyframes case-thread {
          0% {
            stroke-dashoffset: 100;
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 0.78;
          }
        }

        @keyframes case-pin {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.55);
          }
        }

        @keyframes case-floating-card {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes case-location-tile {
          0%,
          100% {
            border-color: rgba(68, 64, 60, 1);
          }
          50% {
            border-color: rgba(215, 184, 97, 0.85);
          }
        }

        .case-sweep {
          animation: case-sweep 4.8s linear infinite;
        }

        .case-fog {
          animation: case-fog 7s ease-in-out infinite;
        }

        .case-fog-a {
          --case-rotate: -12deg;
        }

        .case-fog-b {
          --case-rotate: 10deg;
          animation-delay: -2.5s;
        }

        .case-ticker {
          animation: case-ticker 24s linear infinite;
        }

        .case-board-glow {
          animation: case-floating-card 3.5s ease-in-out infinite;
        }

        .case-map-lines {
          background-image:
            linear-gradient(30deg, transparent 47%, rgba(215, 184, 97, 0.22) 49%, transparent 51%),
            linear-gradient(150deg, transparent 47%, rgba(139, 30, 30, 0.28) 49%, transparent 51%);
          background-size: 96px 96px;
        }

        .case-scan-line {
          animation: case-scan-line 3.2s ease-in-out infinite;
        }

        .case-seal {
          animation: case-seal 2.8s ease-in-out infinite;
        }

        .case-thread {
          filter: drop-shadow(0 0 5px rgba(215, 184, 97, 0.55));
          stroke-dasharray: 100;
          animation: case-thread 4.5s ease-in-out infinite;
        }

        .case-thread-alt {
          animation-delay: 1.2s;
          filter: drop-shadow(0 0 5px rgba(139, 30, 30, 0.65));
        }

        .case-thread-soft {
          animation-delay: 2s;
          filter: drop-shadow(0 0 4px rgba(255, 243, 207, 0.45));
        }

        .case-pin {
          animation: case-pin 2.4s ease-in-out infinite;
        }

        .case-floating-card {
          animation: case-floating-card 3.2s ease-in-out infinite;
        }

        .case-location-tile {
          animation: case-location-tile 2.2s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}
