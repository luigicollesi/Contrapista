"use client";

import type { CSSProperties } from "react";
import {
  getPlayerColorHex,
  getPlayerName,
} from "@/components/game/display-utils";
import type { GameState, Room } from "@/components/game/types";
import { useNow } from "@/components/game/use-countdown-seconds";
import { RoomModal } from "@/components/rooms/room-modal";

type RouletteModalProps = {
  gameState: GameState;
  room: Room | null;
};

export function RouletteModal({ gameState, room }: RouletteModalProps) {
  const now = useNow(250);
  const pool = gameState.roulettePool ?? [];
  const rouletteSpinKey = [
    gameState.phaseStartedAt,
    gameState.rouletteSelectedId,
    pool.join("-"),
  ].join(":");
  const shouldRevealRouletteResult = now >= gameState.phaseEndsAt - 250;
  const selectedPlayer = shouldRevealRouletteResult
    ? room?.users.find((user) => user.id === gameState.rouletteSelectedId)
    : null;
  const wheelPlayers = pool
    .map((playerId) => room?.users.find((user) => user.id === playerId))
    .filter((player): player is NonNullable<typeof player> => Boolean(player));
  const rawSelectedIndex = wheelPlayers.findIndex(
    (player) => player.id === gameState.rouletteSelectedId,
  );
  const selectedIndex = rawSelectedIndex >= 0 ? rawSelectedIndex : 0;
  const segmentAngle = 360 / Math.max(1, wheelPlayers.length);
  const wheelStops = wheelPlayers
    .map((player, index) => {
      const start = index * segmentAngle;
      const end = (index + 1) * segmentAngle;

      return `${getPlayerColorHex(player.color)} ${start}deg ${end}deg`;
    })
    .join(", ");
  const targetRotation = 1440 - (selectedIndex * segmentAngle + segmentAngle / 2);

  return (
    <RoomModal variant="event">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Ordem da mesa
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
        Definindo a vez
      </h2>
      <div className="mt-6 flex flex-col items-center gap-6 sm:mt-8">
        <div
          className="relative h-64 w-64 rounded-full border-2 border-[#d7b861] bg-[#0f120e] sm:h-72 sm:w-72"
          key={rouletteSpinKey}
          style={{ "--target-rotation": `${targetRotation}deg` } as CSSProperties}
        >
          <div
            className="roulette-wheel absolute inset-4 rounded-full border border-[#d7b861]/40"
            style={{
              background: `conic-gradient(from -90deg, ${wheelStops || "#d7b861 0deg 360deg"})`,
            }}
          />
          <div className="absolute left-1/2 top-0 h-10 w-5 -translate-x-1/2 rounded-b-full bg-[#fff3cf] shadow-lg" />
          <div className="absolute inset-16 rounded-full border border-[#d7b861]/50 bg-[#171b16] shadow-inner" />
          <div className="absolute inset-0 flex items-center justify-center px-12 text-center">
            <p className="font-serif text-xl font-bold text-[#fff3cf] sm:text-2xl">
              {selectedPlayer ? getPlayerName(selectedPlayer) : "Sorteando…"}
            </p>
          </div>
        </div>
        <ol className="flex flex-wrap justify-center gap-x-2 gap-y-1 border-y border-[#d7b861]/20 py-3" aria-label="Ordem sendo formada">
          {pool.map((playerId) => {
            const player = room?.users.find((user) => user.id === playerId);
            const isSelected =
              shouldRevealRouletteResult &&
              playerId === gameState.rouletteSelectedId;

            return (
              <li
                className={`text-sm font-bold ${
                  isSelected
                    ? "text-[#fff3cf]"
                    : "text-stone-500"
                }`}
                key={playerId}
              >
                {getPlayerName(player)}
                {isSelected ? <span className="ml-1 text-[9px] uppercase tracking-[0.1em] text-[#d7b861]">Selecionado</span> : null}
                <span aria-hidden="true" className="ml-2 text-stone-700">→</span>
              </li>
            );
          })}
        </ol>
      </div>
      <style jsx>{`
        @keyframes roulette-spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(var(--target-rotation));
          }
        }

        .roulette-wheel {
          animation: roulette-spin 3s cubic-bezier(0.12, 0.78, 0.22, 1) both;
          will-change: transform;
        }

        @media (prefers-reduced-motion: reduce) {
          .roulette-wheel {
            animation-duration: 1ms;
            will-change: auto;
          }
        }
      `}</style>
    </RoomModal>
  );
}
