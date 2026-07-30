import { PLAYER_COLORS, type PlayerColor } from "@/lib/player-colors";

export function getPlayerColorHex(color?: PlayerColor | null) {
  return color ? PLAYER_COLORS[color]?.hex ?? "#d7b861" : "#d7b861";
}

export function getPlayerName(player?: { nickname: string | null }) {
  return player?.nickname ?? "Investigador";
}

export function formatTimer(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return "--";
  }

  const seconds = Math.max(0, Math.floor(totalSeconds));

  if (seconds < 60) {
    return String(seconds).padStart(2, "0");
  }

  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}
