type CaseCreationStatusProps = {
  elapsedSeconds: number;
  estimatedSeconds: number | null;
  formatElapsedTime: (seconds: number) => string;
  progress: number;
  retryNotice: string;
  stepIndex: number;
  steps: string[];
};

export function CaseCreationStatus({
  elapsedSeconds,
  estimatedSeconds,
  formatElapsedTime,
  progress,
  retryNotice,
  stepIndex,
  steps,
}: CaseCreationStatusProps) {
  return (
    <>
      <div className="mt-6 inline-flex flex-wrap items-center gap-4 rounded-lg border border-[#d7b861]/40 bg-[#171b16]/95 px-5 py-4 shadow-2xl shadow-black/25 backdrop-blur">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d7b861]/35 bg-[#0f120e] font-mono text-sm font-black text-[#d7b861]">
          ⏱
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
            Tempo de criação
          </p>
          <p className="mt-1 font-mono text-3xl font-black text-[#fff3cf]">
            {formatElapsedTime(elapsedSeconds)}
          </p>
        </div>
        {estimatedSeconds !== null ? (
          <div className="border-l border-[#d7b861]/25 pl-4">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
              Estimativa
            </p>
            <p className="mt-1 font-mono text-2xl font-black text-[#fff3cf]">
              {formatElapsedTime(estimatedSeconds)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-7 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-5 shadow-2xl shadow-black/25">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#c8a24a]">
          Andamento do dossiê
        </p>
        <div className="mt-4 flex items-center gap-4">
          <span className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d7b861] opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-[#d7b861]" />
          </span>
          <p className="text-xl font-bold text-[#fff3cf]">{steps[stepIndex]}</p>
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

      {retryNotice ? (
        <p className="mt-4 rounded-lg border border-[#d7b861]/30 bg-[#2d2818]/80 px-4 py-3 text-sm font-medium text-[#fff3cf]">
          {retryNotice}
        </p>
      ) : null}
    </>
  );
}
