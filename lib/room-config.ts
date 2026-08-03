type ClueDistributionConfig = {
  cluesPerPlayer?: number;
  playerCount?: number;
  trueCluesPerPlayer?: number;
};

const DEFAULT_CLUES_PER_PLAYER = 6;
const DEFAULT_TRUE_CLUE_PERCENTAGE = 50;

export function getClueDistribution(config: ClueDistributionConfig = {}) {
  const playerCount = Math.max(1, Math.round(config.playerCount ?? 1));
  const cluesPerPlayer = Math.min(
    10,
    Math.max(2, Math.round(config.cluesPerPlayer ?? DEFAULT_CLUES_PER_PLAYER)),
  );
  const rawTrueCluePercentage = Math.min(
    100,
    Math.max(0, Math.round(config.trueCluesPerPlayer ?? DEFAULT_TRUE_CLUE_PERCENTAGE)),
  );
  const totalClues = playerCount * cluesPerPlayer;
  const trueClueCount = Math.round((totalClues * rawTrueCluePercentage) / 100);
  const trueCluePercentage = Math.round((trueClueCount * 100) / totalClues);
  const trueCluesPerPlayer = Math.round((cluesPerPlayer * trueCluePercentage) / 100);

  return {
    cluesPerPlayer,
    playerCount,
    trueCluePercentage,
    trueClueCount,
    trueCluesPerPlayer,
    falseCluesPerPlayer: cluesPerPlayer - trueCluesPerPlayer,
  };
}
