/// <reference lib="webworker" />

import type {
  CompareDiffToken,
  CompareWorkerRequest,
  CompareWorkerResponse,
} from '../types/compare';

declare const self: DedicatedWorkerGlobalScope;

const DEFAULT_SETTINGS = {
  batchSize: 5000,
  complexThreshold: 25000,
  maxWordThreshold: 60000,
};

const buildMatrix = (words1: string[], words2: string[]) => {
  const rows = words1.length + 1;
  const cols = words2.length + 1;
  const matrix: number[][] = new Array(rows);

  for (let i = 0; i < rows; i += 1) {
    matrix[i] = new Array(cols).fill(0);
  }

  for (let i = 1; i <= words1.length; i += 1) {
    for (let j = 1; j <= words2.length; j += 1) {
      matrix[i][j] =
        words1[i - 1] === words2[j - 1]
          ? matrix[i - 1][j - 1] + 1
          : Math.max(matrix[i][j - 1], matrix[i - 1][j]);
    }
  }

  return matrix;
};

const backtrack = (matrix: number[][], words1: string[], words2: string[]): CompareDiffToken[] => {
  const tokens: CompareDiffToken[] = [];
  let i = words1.length;
  let j = words2.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) {
      tokens.unshift({ type: 'unchanged', text: words1[i - 1] });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || matrix[i][j] === matrix[i][j - 1])) {
      tokens.unshift({ type: 'added', text: words2[j - 1] });
      j -= 1;
    } else if (i > 0) {
      tokens.unshift({ type: 'removed', text: words1[i - 1] });
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return tokens;
};

const diff = (words1: string[], words2: string[]): CompareDiffToken[] => {
  if (words1.length === 0 && words2.length === 0) {
    return [];
  }

  const matrix = buildMatrix(words1, words2);
  return backtrack(matrix, words1, words2);
};

const chunkedDiff = (
  words1: string[],
  words2: string[],
  chunkSize: number
): CompareDiffToken[] => {
  if (words1.length === 0 && words2.length === 0) {
    return [];
  }

  const tokens: CompareDiffToken[] = [];
  let start1 = 0;
  let start2 = 0;

  // Advance by the actual number of tokens consumed per chunk to maintain alignment
  while (start1 < words1.length || start2 < words2.length) {
    const slice1 = words1.slice(start1, Math.min(start1 + chunkSize, words1.length));
    const slice2 = words2.slice(start2, Math.min(start2 + chunkSize, words2.length));

    const chunkTokens = diff(slice1, slice2);
    tokens.push(...chunkTokens);

    // Count how many tokens from each side were consumed in this chunk
    let consumed1 = 0;
    let consumed2 = 0;
    for (const t of chunkTokens) {
      if (t.type === 'unchanged') {
        consumed1 += 1; consumed2 += 1;
      } else if (t.type === 'removed') {
        consumed1 += 1;
      } else if (t.type === 'added') {
        consumed2 += 1;
      }
    }

    // Fallback to progress by a small step if diff returned nothing (shouldn't happen)
    if (consumed1 === 0 && consumed2 === 0) {
      consumed1 = Math.min(chunkSize, words1.length - start1);
      consumed2 = Math.min(chunkSize, words2.length - start2);
    }

    start1 += consumed1;
    start2 += consumed2;
  }

  return tokens;
};

self.onmessage = (event: MessageEvent<CompareWorkerRequest>) => {
  const { data } = event;
  if (!data || data.type !== 'compare') {
    return;
  }

  const { baseTokens, comparisonTokens, warnings, settings } = data.payload;
  const {
    batchSize = DEFAULT_SETTINGS.batchSize,
    complexThreshold = DEFAULT_SETTINGS.complexThreshold,
    maxWordThreshold = DEFAULT_SETTINGS.maxWordThreshold,
  } = settings ?? {};

  if (!baseTokens || !comparisonTokens || baseTokens.length === 0 || comparisonTokens.length === 0) {
    const response: CompareWorkerResponse = {
      type: 'error',
      message: warnings.emptyTextMessage ?? 'One or both texts are empty.',
      code: 'EMPTY_TEXT',
    };
    self.postMessage(response);
    return;
  }

  if (baseTokens.length > maxWordThreshold || comparisonTokens.length > maxWordThreshold) {
    const response: CompareWorkerResponse = {
      type: 'error',
      message: warnings.tooLargeMessage ?? 'Documents are too large to compare.',
      code: 'TOO_LARGE',
    };
    self.postMessage(response);
    return;
  }

  const isComplex = baseTokens.length > complexThreshold || comparisonTokens.length > complexThreshold;

  if (isComplex && warnings.complexMessage) {
    const warningResponse: CompareWorkerResponse = {
      type: 'warning',
      message: warnings.complexMessage,
    };
    self.postMessage(warningResponse);
  }

  const start = performance.now();
  const tokens = isComplex
    ? chunkedDiff(baseTokens, comparisonTokens, batchSize)
    : diff(baseTokens, comparisonTokens);
  const durationMs = performance.now() - start;

  const response: CompareWorkerResponse = {
    type: 'success',
    tokens,
    stats: {
      baseWordCount: baseTokens.length,
      comparisonWordCount: comparisonTokens.length,
      durationMs,
    },
  };

  self.postMessage(response);
};
