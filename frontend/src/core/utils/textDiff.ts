// Shared text diff and normalization utilities for compare tool

export const shouldConcatWithoutSpace = (word: string) => {
  return /^[.,!?;:)\]}]/.test(word) || word.startsWith("'") || word === "'s";
};

export const appendWord = (existing: string, word: string) => {
  if (!existing) return word;
  if (shouldConcatWithoutSpace(word)) return `${existing}${word}`;
  return `${existing} ${word}`;
};
export const tokenize = (text: string): string[] => text.split(/\s+/).filter(Boolean);

type TokenType = 'unchanged' | 'removed' | 'added';
export interface LocalToken { type: TokenType; text: string }

const buildLcsMatrix = (a: string[], b: string[]) => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const m: number[][] = new Array(rows);
  for (let i = 0; i < rows; i += 1) m[i] = new Array(cols).fill(0);
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      m[i][j] = a[i - 1] === b[j - 1] ? m[i - 1][j - 1] + 1 : Math.max(m[i][j - 1], m[i - 1][j]);
    }
  }
  return m;
};

export const diffWords = (a: string[], b: string[]): LocalToken[] => {
  const matrix = buildLcsMatrix(a, b);
  const tokens: LocalToken[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      tokens.unshift({ type: 'unchanged', text: a[i - 1] });
      i -= 1; j -= 1;
    } else if (j > 0 && (i === 0 || matrix[i][j] === matrix[i][j - 1])) {
      tokens.unshift({ type: 'added', text: b[j - 1] });
      j -= 1;
    } else if (i > 0) {
      tokens.unshift({ type: 'removed', text: a[i - 1] });
      i -= 1;
    }
  }
  return tokens;
};


