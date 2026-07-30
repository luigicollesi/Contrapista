type ClueDistributionConfig = {
  cluesPerPlayer?: number;
  trueCluesPerPlayer?: number;
};

const DEFAULT_CLUES_PER_PLAYER = 6;
const DEFAULT_TRUE_CLUES_PER_PLAYER = 3;

export function getClueDistribution(config: ClueDistributionConfig = {}) {
  const cluesPerPlayer = Math.min(
    10,
    Math.max(2, Math.round(config.cluesPerPlayer ?? DEFAULT_CLUES_PER_PLAYER)),
  );
  const trueCluesPerPlayer = Math.min(
    cluesPerPlayer,
    Math.max(
      0,
      Math.round(config.trueCluesPerPlayer ?? DEFAULT_TRUE_CLUES_PER_PLAYER),
    ),
  );

  return {
    cluesPerPlayer,
    trueCluesPerPlayer,
    falseCluesPerPlayer: cluesPerPlayer - trueCluesPerPlayer,
  };
}
