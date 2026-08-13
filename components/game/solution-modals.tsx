"use client";

import { formatTimer } from "@/components/game/display-utils";
import type { GameCase, RoomEvent } from "@/components/game/types";
import { useCountdownSeconds } from "@/components/game/use-countdown-seconds";
import { RoomModal } from "@/components/rooms/room-modal";

type SolutionEvent = Extract<RoomEvent, { type: string }>;

type FinalGuessModalProps = {
  event: SolutionEvent;
  finalGuess: string;
  guessEndsAt: number | null;
  isActor: boolean;
  isSubmittingGuess: boolean;
  onChangeGuess: (value: string) => void;
  onSubmit: () => void;
};

export function FinalGuessModal({
  event,
  finalGuess,
  guessEndsAt,
  isActor,
  isSubmittingGuess,
  onChangeGuess,
  onSubmit,
}: FinalGuessModalProps) {
  const guessRemainingSeconds = useCountdownSeconds(guessEndsAt);
  const guessLength = finalGuess.length;

  return (
    <RoomModal variant="event">
      {isActor ? (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Palpite final
          </p>
          <h2 className="mt-2 text-balance font-serif text-3xl font-bold leading-tight text-[#fff3cf] sm:text-5xl">
            Apresente sua tese
          </h2>
          <p className="mt-3 text-sm font-semibold text-stone-400">
            {guessEndsAt
              ? `Envio automático em ${formatTimer(guessRemainingSeconds)}.`
              : "A partida aguarda o envio do seu palpite."}
          </p>
          <textarea
            aria-label="Tese final"
            autoComplete="off"
            className="mt-4 min-h-44 w-full border border-[#d7b861]/35 bg-[#0f120e] p-3 text-base leading-7 text-stone-100 transition-[border-color,box-shadow] duration-150 placeholder:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b861] sm:mt-5 sm:min-h-64 sm:p-4 sm:text-lg sm:leading-8"
            disabled={isSubmittingGuess}
            maxLength={1000}
            name="finalGuess"
            onChange={(changeEvent) => onChangeGuess(changeEvent.target.value)}
            placeholder="Descreva culpado, método, motivo e as respostas centrais do caso…"
            value={finalGuess}
          />
          <div className="mt-3 flex items-center justify-between gap-4 text-xs font-semibold text-stone-500">
            <span className="font-mono tabular-nums">{guessLength} / 1000</span>
            <span className="font-mono tabular-nums">{guessEndsAt ? formatTimer(guessRemainingSeconds) : "Sem timer"}</span>
          </div>
          <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
            <button
              className="min-h-12 w-full touch-manipulation bg-[#d7b861] px-5 font-bold text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={isSubmittingGuess}
              onClick={onSubmit}
              type="button"
            >
              {isSubmittingGuess ? "Enviando…" : "Enviar tese"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Palpite em curso
          </p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
            {event.actorNickname} está registrando uma tese
          </h2>
          <p className="mt-4 text-base leading-7 text-stone-300 sm:mt-5 sm:text-lg sm:leading-8">
            A mesa aguarda o palpite.
          </p>
        </>
      )}
    </RoomModal>
  );
}

export function PendingSolutionModal({ event }: { event: SolutionEvent }) {
  return (
    <RoomModal variant="event">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Palpite enviado
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
        {event.actorNickname} sustentou uma tese
      </h2>
      <div className="mt-5 rounded-lg border border-[#d7b861]/30 bg-[#0f120e] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d7b861]">
          Resposta enviada
        </p>
        <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-200 sm:text-lg sm:leading-8">
          {event.guess?.trim() || "Nenhuma resposta foi escrita."}
        </p>
      </div>
      <div className="mt-6 border-l-2 border-[#d7b861] bg-[#2a2112] px-4 py-3 text-[#fff3cf]" aria-live="polite">
        <span className="font-bold">Conferindo com o arquivo…</span>
      </div>
    </RoomModal>
  );
}

type ManualReviewModalProps = {
  event: SolutionEvent;
  finalAnswer: string;
  isActor: boolean;
  onJudge: (correct: boolean) => void;
};

export function ManualReviewModal({
  event,
  finalAnswer,
  isActor,
  onJudge,
}: ManualReviewModalProps) {
  return (
    <RoomModal variant="event">
      {isActor ? (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Revisão manual
          </p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
            Precisamos da sua honestidade
          </h2>
          <p className="mt-4 rounded-lg border border-[#d7b861]/35 bg-[#2a2112] px-4 py-3 text-sm font-semibold leading-6 text-[#fff3cf]">
            Não conseguimos conferir agora. Compare sua tese com a solução
            oficial e responda com honestidade.
          </p>
          <div className="mt-5 grid gap-px bg-[#d7b861]/25 md:grid-cols-2">
            <div className="bg-[#0f120e] p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d7b861]">Sua tese</p>
              <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-200 sm:text-lg sm:leading-8">{event.guess?.trim() || "Nenhuma resposta foi escrita."}</p>
            </div>
            <div className="bg-[#171b16] p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d7b861]">Resposta oficial</p>
              <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-200 sm:text-lg sm:leading-8">{finalAnswer}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:mt-6 sm:flex sm:flex-wrap sm:justify-end">
            <button
              className="min-h-12 touch-manipulation border border-red-400/45 bg-red-950/40 px-5 font-bold text-red-100 transition-colors duration-150 hover:bg-red-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              onClick={() => onJudge(false)}
              type="button"
            >
              Eu errei
            </button>
            <button
              className="min-h-12 touch-manipulation bg-[#d7b861] px-5 font-bold text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf]"
              onClick={() => onJudge(true)}
              type="button"
            >
              Eu acertei
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Avaliação indisponível
          </p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
            {event.actorNickname} está revisando a própria tese
          </h2>
          <p className="mt-5 rounded-lg border border-[#d7b861]/35 bg-[#2a2112] px-4 py-3 text-sm font-semibold leading-6 text-[#fff3cf]">
            A conferência automática falhou. O autor vai comparar a tese com a
            solução oficial.
          </p>
          <div className="mt-5 rounded-lg border border-stone-700 bg-[#0f120e] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d7b861]">
              Resposta enviada
            </p>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-200 sm:text-lg sm:leading-8">
              {event.guess?.trim() || "Nenhuma resposta foi escrita."}
            </p>
          </div>
        </>
      )}
    </RoomModal>
  );
}

type WrongSolutionModalProps = {
  event: SolutionEvent;
  onClose: () => void;
};

export function WrongSolutionModal({ event, onClose }: WrongSolutionModalProps) {
  return (
    <RoomModal>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-300">
            Palpite incorreto
          </p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
            {event.actorNickname} saiu da disputa
          </h2>
        </div>
        <button
          aria-label="Fechar resultado do palpite"
          className="flex h-10 w-10 touch-manipulation items-center justify-center border border-stone-700 text-xl font-bold text-stone-100 transition-colors duration-150 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>
      <div className="mt-5 rounded-lg border border-red-500/35 bg-red-950/30 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-200">
          Resposta enviada
        </p>
        <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-200 sm:text-lg sm:leading-8">
          {event.guess?.trim() || "Nenhuma resposta foi escrita."}
        </p>
      </div>
      <p className="mt-5 text-sm leading-6 text-stone-400">
        A disputa continua. As pistas desse jogador ficam abertas para consulta.
      </p>
    </RoomModal>
  );
}

type CorrectSolutionModalProps = {
  event: SolutionEvent;
  finalAnswer: GameCase["final_answer"];
  onBackToLobby: () => void;
};

export function CorrectSolutionModal({
  event,
  finalAnswer,
  onBackToLobby,
}: CorrectSolutionModalProps) {
  return (
    <RoomModal variant="event">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Caso solucionado
      </p>
      <h2 className="mt-2 text-balance font-serif text-4xl font-bold uppercase leading-tight text-[#fff3cf] sm:text-6xl">
        {event.actorNickname}
      </h2>
      <p className="mt-3 text-stone-400">
        A tese bate com a solução oficial.
      </p>
      <div className="mt-6 border-y border-[#d7b861]/25 py-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#d7b861]">Solução oficial</p>
        <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-300 sm:text-lg sm:leading-8">{finalAnswer}</p>
      </div>
      <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
        <button
          className="min-h-12 w-full touch-manipulation bg-[#d7b861] px-5 font-bold text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf] sm:w-auto"
          onClick={onBackToLobby}
          type="button"
        >
          Voltar à ante-sala
        </button>
      </div>
    </RoomModal>
  );
}

type NoWinnerSolutionModalProps = {
  finalAnswer: GameCase["final_answer"];
  onBackToLobby: () => void;
};

export function NoWinnerSolutionModal({
  finalAnswer,
  onBackToLobby,
}: NoWinnerSolutionModalProps) {
  return (
    <RoomModal variant="event">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Caso encerrado
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
        A partida terminou sem vencedor
      </h2>
      <p className="mt-3 text-stone-400">
        Ninguém sustentou a solução.
      </p>
      <div className="mt-6 border-y border-[#d7b861]/25 py-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#d7b861]">Resposta oficial</p>
        <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-300 sm:text-lg sm:leading-8">{finalAnswer}</p>
      </div>
      <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
        <button
          className="min-h-12 w-full touch-manipulation bg-[#d7b861] px-5 font-bold text-[#17130d] transition-colors duration-150 hover:bg-[#f3dfaa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3cf] sm:w-auto"
          onClick={onBackToLobby}
          type="button"
        >
          Voltar à ante-sala
        </button>
      </div>
    </RoomModal>
  );
}
