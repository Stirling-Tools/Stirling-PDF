// Pure helper utilities for building and manipulating bulk page selection expressions

export type LogicalOperator = 'and' | 'or' | 'not' | 'even' | 'odd';

// Returns a new CSV expression with expr appended.
// If current ends with an operator token, expr is appended directly.
// Otherwise, it is joined with " or ".
export function appendExpression(currentInput: string, expr: string): string {
  const current = (currentInput || '').trim();
  if (!current) return expr;
  const endsWithOperator = /(\b(and|not|or)\s*|[&|,!]\s*)$/i.test(current);
  // Add space if operator doesn't already have one
  if (endsWithOperator) {
    const needsSpace = !current.endsWith(' ');
    return `${current}${needsSpace ? ' ' : ''}${expr}`;
  }
  return `${current} or ${expr}`;
}

// Smartly inserts/normalizes a logical operator at the end of the current input.
// Produces a trailing space to allow the next token to be typed naturally.
export function insertOperatorSmart(currentInput: string, op: LogicalOperator): string {
  const text = (currentInput || '').trim();
  // Handle 'even' and 'odd' as page selection expressions, not logical operators
  if (op === 'even' || op === 'odd') {
    if (text.length === 0) return `${op} `;
    // If current input ends with a logical operator, append the page selection with proper spacing
    const endsWithOperator = /(\b(and|not|or)\s*|[&|,!]\s*)$/i.test(text);
    if (endsWithOperator) {
      // Add space if the operator doesn't already have one
      const needsSpace = !text.endsWith(' ');
      return `${text}${needsSpace ? ' ' : ''}${op} `;
    }
    return `${text} or ${op} `;
  }

  if (text.length === 0) return `${op} `;

  // Extract up to the last two operator tokens (words or symbols) from the end
  const tokens: string[] = [];
  let rest = text;
  for (let i = 0; i < 2; i++) {
    const m = rest.match(/(?:\s*)(?:(&|\||,|!|\band\b|\bor\b|\bnot\b))\s*$/i);
    if (!m || m.index === undefined) break;
    const raw = m[1].toLowerCase();
    const word = raw === '&' ? 'and' : raw === '|' || raw === ',' ? 'or' : raw === '!' ? 'not' : raw;
    tokens.unshift(word);
    rest = rest.slice(0, m.index).trimEnd();
  }

  const emit = (base: string, phrase: string) => `${base} ${phrase} `;
  const click = op; // desired operator

  if (tokens.length === 0) {
    return emit(text, click);
  }

  // Normalize to allowed set
  const phrase = tokens.join(' ');
  const allowed = new Set(['and', 'or', 'not', 'and not', 'or not']);

  // Helpers for transitions from a single trailing token
  const fromSingle = (t: string): string => {
    if (t === 'and') {
      if (click === 'and') return 'and';
      if (click === 'or') return 'or'; // 'and or' is invalid, so just use 'or'
      return 'and not';
    }
    if (t === 'or') {
      if (click === 'and') return 'and';
      if (click === 'or') return 'or';
      return 'or not';
    }
    // t === 'not'
    if (click === 'and') return 'and';
    if (click === 'or') return 'or';
    return 'not';
  };

  // From combined phrase
  const fromCombo = (p: string): string => {
    if (p === 'and not') {
      if (click === 'not') return 'and not';
      if (click === 'and') return 'and';
      if (click === 'or') return 'or'; // 'and not or' is invalid, so just use 'or'
      return 'and not';
    }
    if (p === 'or not') {
      if (click === 'not') return 'or not';
      if (click === 'or') return 'or';
      if (click === 'and') return 'and'; // 'or not and' is invalid, so just use 'and'
      return 'or not';
    }
    // Invalid combos (e.g., 'not and', 'not or', 'or and', 'and or') → collapse to clicked op
    return click;
  };

  const base = rest.trim();
  const nextPhrase = tokens.length === 1 ? fromSingle(tokens[0]) : fromCombo(phrase);
  if (!allowed.has(nextPhrase)) {
    return emit(base, click);
  }
  return emit(base, nextPhrase);
}

// Expression builders for Advanced actions
export function firstNExpression(n: number, maxPages: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const end = Math.min(maxPages, Math.max(1, Math.floor(n)));
  return `1-${end}`;
}

export function lastNExpression(n: number, maxPages: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const count = Math.max(1, Math.floor(n));
  const start = Math.max(1, maxPages - count + 1);
  if (maxPages <= 0) return null;
  return `${start}-${maxPages}`;
}

export function everyNthExpression(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.max(1, Math.floor(n))}n`;
}

export function rangeExpression(start: number, end: number, maxPages: number): string | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  let s = Math.floor(start);
  let e = Math.floor(end);
  if (s > e) [s, e] = [e, s];
  s = Math.max(1, s);
  e = maxPages > 0 ? Math.min(maxPages, e) : e;
  return `${s}-${e}`;
}


