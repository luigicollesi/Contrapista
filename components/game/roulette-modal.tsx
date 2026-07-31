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
    <RoomModal>
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d7b861]">
        Roleta de ordem
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#fff3cf] sm:text-3xl">
        Sorteando o próximo jogador
      </h2>
      <div className="mt-5 flex flex-col items-center gap-5 sm:mt-6 sm:gap-6">
        <div
          className="relative h-64 w-64 rounded-full border-4 border-[#d7b861] bg-[#0f120e] shadow-[0_0_34px_rgba(215,184,97,.28)] sm:h-72 sm:w-72"
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
              {selectedPlayer ? getPlayerName(selectedPlayer) : "Sorteando..."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {pool.map((playerId) => {
            const player = room?.users.find((user) => user.id === playerId);
            const isSelected =
              shouldRevealRouletteResult &&
              playerId === gameState.rouletteSelectedId;

            return (
              <span
                className={`rounded-full border px-3 py-1 text-sm font-bold ${
                  isSelected
                    ? "border-[#d7b861] bg-[#d7b861] text-[#17130d]"
                    : "border-stone-700 bg-[#0f120e] text-stone-300"
                }`}
                key={playerId}
              >
                {getPlayerName(player)}
              </span>
            );
          })}
        </div>
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
      `}</style>
    </RoomModal>
  );
}
