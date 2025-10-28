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

const countBaseTokens = (segment: CompareDiffToken[]) =>
  segment.reduce((acc, token) => acc + (token.type !== 'added' ? 1 : 0), 0);

const countComparisonTokens = (segment: CompareDiffToken[]) =>
  segment.reduce((acc, token) => acc + (token.type !== 'removed' ? 1 : 0), 0);

const findLastUnchangedIndex = (segment: CompareDiffToken[]) => {
  for (let i = segment.length - 1; i >= 0; i -= 1) {
    if (segment[i].type === 'unchanged') {
      return i;
    }
  }
  return -1;
};

const chunkedDiff = (
  words1: string[],
  words2: string[],
  chunkSize: number,
  emit: (tokens: CompareDiffToken[]) => void
) => {
  if (words1.length === 0 && words2.length === 0) {
    return;
  }

  const maxWindow = Math.max(chunkSize * 6, chunkSize + 512);
  const minCommit = Math.max(1, Math.floor(chunkSize * 0.1));

  let index1 = 0;
  let index2 = 0;
  let buffer1: string[] = [];
  let buffer2: string[] = [];

  const flushRemainder = () => {
    if (buffer1.length === 0 && buffer2.length === 0) {
      return;
    }
    const finalTokens = diff(buffer1, buffer2);
    if (finalTokens.length > 0) {
      emit(finalTokens);
    }
    buffer1 = [];
    buffer2 = [];
    index1 = words1.length;
    index2 = words2.length;
  };

  while (
    index1 < words1.length ||
    index2 < words2.length ||
    buffer1.length > 0 ||
    buffer2.length > 0
  ) {
    const remaining1 = Math.max(0, words1.length - index1);
    const remaining2 = Math.max(0, words2.length - index2);

    let windowSize = Math.max(chunkSize, buffer1.length, buffer2.length);
    let window1: string[] = [];
    let window2: string[] = [];
    let chunkTokens: CompareDiffToken[] = [];
    let reachedEnd = false;

    while (true) {
      const take1 = Math.min(Math.max(0, windowSize - buffer1.length), remaining1);
      const take2 = Math.min(Math.max(0, windowSize - buffer2.length), remaining2);

      const slice1 = take1 > 0 ? words1.slice(index1, index1 + take1) : [];
      const slice2 = take2 > 0 ? words2.slice(index2, index2 + take2) : [];

      window1 = buffer1.length > 0 ? [...buffer1, ...slice1] : slice1;
      window2 = buffer2.length > 0 ? [...buffer2, ...slice2] : slice2;

      if (window1.length === 0 && window2.length === 0) {
        flushRemainder();
        return;
      }

      chunkTokens = diff(window1, window2);
      const lastStableIndex = findLastUnchangedIndex(chunkTokens);

      reachedEnd =
        index1 + take1 >= words1.length &&
        index2 + take2 >= words2.length;

      const windowTooLarge =
        window1.length >= maxWindow ||
        window2.length >= maxWindow;

      if (lastStableIndex >= 0 || reachedEnd || windowTooLarge) {
        break;
      }

      const canGrow1 = take1 < remaining1;
      const canGrow2 = take2 < remaining2;

      if (!canGrow1 && !canGrow2) {
        break;
      }

      windowSize = Math.min(
        maxWindow,
        windowSize + Math.max(64, Math.floor(chunkSize * 0.5))
      );
    }

    if (chunkTokens.length === 0) {
      if (reachedEnd) {
        flushRemainder();
        return;
      }
      windowSize = Math.min(windowSize + Math.max(64, Math.floor(chunkSize * 0.5)), maxWindow);
      continue;
    }

    let commitIndex = reachedEnd ? chunkTokens.length - 1 : findLastUnchangedIndex(chunkTokens);
    if (commitIndex < 0) {
      commitIndex = reachedEnd
        ? chunkTokens.length - 1
        : Math.min(chunkTokens.length - 1, minCommit - 1);
    }

    const commitTokens = commitIndex >= 0 ? chunkTokens.slice(0, commitIndex + 1) : [];
    const baseConsumed = countBaseTokens(commitTokens);
    const comparisonConsumed = countComparisonTokens(commitTokens);

    if (commitTokens.length > 0) {
      emit(commitTokens);
    }

    const consumedFromNew1 = Math.max(0, baseConsumed - buffer1.length);
    const consumedFromNew2 = Math.max(0, comparisonConsumed - buffer2.length);

    index1 += consumedFromNew1;
    index2 += consumedFromNew2;

    buffer1 = window1.slice(baseConsumed);
    buffer2 = window2.slice(comparisonConsumed);

    if (reachedEnd) {
      flushRemainder();
      break;
    }

    // Prevent runaway buffers: if we made no progress, forcibly consume one token
    if (commitTokens.length === 0 && buffer1.length + buffer2.length > 0) {
      if (buffer1.length > 0 && index1 < words1.length) {
        buffer1 = buffer1.slice(1);
        index1 += 1;
      } else if (buffer2.length > 0 && index2 < words2.length) {
        buffer2 = buffer2.slice(1);
        index2 += 1;
      }
    }
  }

  flushRemainder();
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
    // For compare tool, do not fail hard; warn and continue with chunked diff
    const response: CompareWorkerResponse = {
      type: 'warning',
      message: warnings.tooLargeMessage ?? 'Documents are too large to compare.',
    };
    self.postMessage(response);
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
  chunkedDiff(
    baseTokens,
    comparisonTokens,
    batchSize,
    (tokens) => {
      if (tokens.length === 0) {
        return;
      }
      const response: CompareWorkerResponse = {
        type: 'chunk',
        tokens,
      };
      self.postMessage(response);
    }
  );
  const durationMs = performance.now() - start;

  const response: CompareWorkerResponse = {
    type: 'success',
    stats: {
      baseWordCount: baseTokens.length,
      comparisonWordCount: comparisonTokens.length,
      durationMs,
    },
  };

  self.postMessage(response);
};
