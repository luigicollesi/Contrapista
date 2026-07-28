export const PLAYER_COLORS = {
  red: {
    name: "Vermelho",
    hex: "#DC2626",
  },
  blue: {
    name: "Azul",
    hex: "#2563EB",
  },
  green: {
    name: "Verde",
    hex: "#16A34A",
  },
  yellow: {
    name: "Amarelo",
    hex: "#EAB308",
  },
  purple: {
    name: "Roxo",
    hex: "#9333EA",
  },
  orange: {
    name: "Laranja",
    hex: "#EA580C",
  },
} as const;

export type PlayerColor = keyof typeof PLAYER_COLORS;

export function isPlayerColor(color: string): color is PlayerColor {
  return color in PLAYER_COLORS;
}

export function normalizePlayerColor(color: string): PlayerColor {
  if (isPlayerColor(color)) {
    return color;
  }

  const entry = Object.entries(PLAYER_COLORS).find(
    ([, value]) => value.hex.toLowerCase() === color.toLowerCase(),
  );

  return entry ? (entry[0] as PlayerColor) : "red";
}
