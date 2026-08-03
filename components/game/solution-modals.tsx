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

  return (
    <RoomModal>
      {isActor ? (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
            Palpite final
          </p>
          <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
            Escreva sua tese
          </h2>
          <p className="mt-3 text-sm font-semibold text-stone-400">
            {guessEndsAt
              ? `Envio automático em ${formatTimer(guessRemainingSeconds)}.`
              : "A partida aguarda o envio do seu palpite."}
          </p>
          <textarea
            className="mt-4 min-h-44 w-full rounded-lg border border-[#d7b861]/35 bg-[#0f120e] p-3 text-base leading-7 text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-[#d7b861] focus:ring-4 focus:ring-[#d7b861]/20 sm:mt-5 sm:min-h-64 sm:p-4 sm:text-lg sm:leading-8"
            disabled={isSubmittingGuess}
            onChange={(changeEvent) => onChangeGuess(changeEvent.target.value)}
            placeholder="Descreva culpado, método, motivo e as respostas centrais do caso."
            value={finalGuess}
          />
          <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
            <button
              className="h-12 w-full rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:w-auto"
              disabled={isSubmittingGuess}
              onClick={onSubmit}
              type="button"
            >
              {isSubmittingGuess ? "Enviando" : "Enviar palpite"}
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
    <RoomModal>
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
      <div className="mt-6 flex items-center gap-3 rounded-lg border border-[#d7b861]/25 bg-[#2a2112] px-4 py-3 text-[#fff3cf]">
        <span className="relative flex h-4 w-4">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d7b861] opacity-75" />
          <span className="relative inline-flex h-4 w-4 rounded-full bg-[#d7b861]" />
        </span>
        <span className="font-bold">Conferindo a tese...</span>
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
    <RoomModal>
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
          <div className="mt-5 rounded-lg border border-stone-700 bg-[#0f120e] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d7b861]">
              Sua tese
            </p>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-200 sm:text-lg sm:leading-8">
              {event.guess?.trim() || "Nenhuma resposta foi escrita."}
            </p>
          </div>
          <div className="mt-4 rounded-lg border border-[#d7b861]/30 bg-[#171b16] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d7b861]">
              Resposta oficial
            </p>
            <p className="mt-3 whitespace-pre-line text-base leading-7 text-stone-200 sm:text-lg sm:leading-8">
              {finalAnswer}
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:mt-6 sm:flex sm:flex-wrap sm:justify-end">
            <button
              className="h-12 rounded-lg border border-red-400/45 bg-red-950/40 px-5 font-bold text-red-100 transition hover:bg-red-900/60 sm:h-11"
              onClick={() => onJudge(false)}
              type="button"
            >
              Eu errei
            </button>
            <button
              className="h-12 rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] sm:h-11"
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-800 text-lg font-bold text-stone-100 transition hover:bg-stone-700"
          onClick={onClose}
          type="button"
        >
          X
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
    <RoomModal>
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Caso encerrado
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
        {event.actorNickname} acertou e venceu o caso
      </h2>
      <p className="mt-3 text-stone-400">
        A tese bate com a solução oficial.
      </p>
      <p className="mt-4 whitespace-pre-line text-base leading-7 text-stone-300 sm:mt-5 sm:text-lg sm:leading-8">
        {finalAnswer}
      </p>
      <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
        <button
          className="h-12 w-full rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] sm:h-11 sm:w-auto"
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
    <RoomModal>
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Caso encerrado
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
        A partida terminou sem vencedor
      </h2>
      <p className="mt-3 text-stone-400">
        Ninguém sustentou a solução.
      </p>
      <p className="mt-4 whitespace-pre-line text-base leading-7 text-stone-300 sm:mt-5 sm:text-lg sm:leading-8">
        {finalAnswer}
      </p>
      <div className="mt-5 flex justify-stretch sm:mt-6 sm:justify-end">
        <button
          className="h-12 w-full rounded-lg bg-[#d7b861] px-5 font-bold text-[#17130d] transition hover:bg-[#f3dfaa] sm:h-11 sm:w-auto"
          onClick={onBackToLobby}
          type="button"
        >
          Voltar à ante-sala
        </button>
      </div>
    </RoomModal>
  );
}
