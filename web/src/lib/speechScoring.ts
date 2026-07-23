export interface SpeechAccuracyResult {
  matchedWords: string[];
  missedWords: string[];
  score: number;
  wordDetails: Array<{ matched: boolean; word: string; inserted?: boolean }>;
}

function normalizeWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshteinDistance(first: string, second: string): number {
  const previous = Array.from(
    { length: second.length + 1 },
    (_, index) => index
  );

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex++) {
    const current = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex++) {
      const substitutionCost =
        first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      current[secondIndex] = Math.min(
        current[secondIndex - 1] + 1,
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[second.length];
}

function wordSubstitutionCost(expected: string, actual: string): number {
  if (expected === actual) return 0;
  const tolerance = expected.length >= 5 ? Math.floor(expected.length * 0.2) : 0;
  return tolerance > 0 && levenshteinDistance(expected, actual) <= tolerance
    ? 0.5
    : 1;
}

/**
 * Scores recognized text using ordered, one-to-one word alignment.
 * Insertions, omissions, duplicates and reordered words all reduce the score.
 */
export function scoreSpeechAccuracy(
  expected: string,
  actual: string
): SpeechAccuracyResult {
  const expectedWords = normalizeWords(expected);
  const actualWords = normalizeWords(actual);
  if (expectedWords.length === 0) {
    return { score: 0, matchedWords: [], missedWords: [], wordDetails: [] };
  }

  const costs = Array.from({ length: expectedWords.length + 1 }, () =>
    Array(actualWords.length + 1).fill(0) as number[]
  );

  for (let row = 0; row <= expectedWords.length; row++) costs[row][0] = row;
  for (let column = 0; column <= actualWords.length; column++) {
    costs[0][column] = column;
  }

  for (let row = 1; row <= expectedWords.length; row++) {
    for (let column = 1; column <= actualWords.length; column++) {
      costs[row][column] = Math.min(
        costs[row - 1][column] + 1,
        costs[row][column - 1] + 1,
        costs[row - 1][column - 1] +
          wordSubstitutionCost(
            expectedWords[row - 1],
            actualWords[column - 1]
          )
      );
    }
  }

  const reversedDetails: Array<{
    matched: boolean;
    word: string;
    inserted?: boolean;
  }> = [];
  let row = expectedWords.length;
  let column = actualWords.length;
  const approximatelyEqual = (first: number, second: number) =>
    Math.abs(first - second) < 0.001;

  while (row > 0 || column > 0) {
    if (row > 0 && column > 0) {
      const substitutionCost = wordSubstitutionCost(
        expectedWords[row - 1],
        actualWords[column - 1]
      );
      if (
        approximatelyEqual(
          costs[row][column],
          costs[row - 1][column - 1] + substitutionCost
        )
      ) {
        reversedDetails.push({
          word: expectedWords[row - 1],
          matched: substitutionCost < 1,
        });
        row--;
        column--;
        continue;
      }
    }

    if (
      row > 0 &&
      approximatelyEqual(costs[row][column], costs[row - 1][column] + 1)
    ) {
      reversedDetails.push({ word: expectedWords[row - 1], matched: false });
      row--;
      continue;
    }

    if (column > 0) {
      reversedDetails.push({
        word: actualWords[column - 1],
        matched: false,
        inserted: true,
      });
      column--;
    }
  }

  const wordDetails = reversedDetails.reverse();
  const matchedWords = wordDetails
    .filter(({ matched }) => matched)
    .map(({ word }) => word);
  const missedWords = wordDetails
    .filter(({ matched }) => !matched)
    .map(({ word }) => word);
  // Standard word error rate uses the expected/reference word count (N).
  const denominator = expectedWords.length;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (1 - costs[expectedWords.length][actualWords.length] / denominator) *
          100
      )
    )
  );

  return { score, matchedWords, missedWords, wordDetails };
}
