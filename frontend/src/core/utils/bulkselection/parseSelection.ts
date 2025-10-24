// A parser that converts selection expressions (e.g., "1-10 & 2n & !50-100", "odd", "2n-1")
// into a list of page numbers within [1, maxPages].

/*
    Supported grammar (case-insensitive for words):
    expression   := disjunction
    disjunction  := conjunction ( ("," | "|" | "or") conjunction )*
    conjunction  := unary ( ("&" | "and") unary )*
    unary        := ("!" unary) | ("not" unary) | primary
    primary      := "(" expression ")" | range | progression | keyword | number
    range        := number "-" number    // inclusive
    progression  := k ["*"] "n" (("+" | "-") c)?   // k >= 1, c any integer, n starts at 0
    keyword      := "even" | "odd"
    number       := digits (>= 1)

    Precedence: "!" (NOT) > "&"/"and" (AND) > "," "|" "or" (OR)
    Associativity: left-to-right within the same precedence level

    Notes:
    - Whitespace is ignored.
    - The universe is [1..maxPages]. The complement operator ("!" / "not") applies within this universe.
    - Out-of-bounds numbers are clamped in ranges and ignored as singletons.
    - On parse failure, the parser falls back to CSV (numbers and ranges separated by commas).

    Examples:
    1-10 & even        -> even pages between 1 and 10
    !(5-7)             -> all pages except 5..7
    3n+1               -> 1,4,7,... (n starts at 0)
    (2n | 3n+1) & 1-20 -> multiples of 2 or numbers of the form 3n+1 within 1..20
*/

export function parseSelection(input: string, maxPages: number): number[] {
  const clampedMax = Math.max(0, Math.floor(maxPages || 0));
  if (clampedMax === 0) return [];

  const trimmed = (input || '').trim();
  if (trimmed.length === 0) return [];

  try {
    const parser = new ExpressionParser(trimmed, clampedMax);
    const resultSet = parser.parse();
    return toSortedArray(resultSet);
  } catch {
    // Fallback: simple CSV parser (e.g., "1,3,5-10")
    return toSortedArray(parseCsvFallback(trimmed, clampedMax));
  }
}

export function parseSelectionWithDiagnostics(
  input: string,
  maxPages: number,
  options?: { strict?: boolean }
): { pages: number[]; warning?: string } {
  const clampedMax = Math.max(0, Math.floor(maxPages || 0));
  if (clampedMax === 0) return { pages: [] };

  const trimmed = (input || '').trim();
  if (trimmed.length === 0) return { pages: [] };

  try {
    const parser = new ExpressionParser(trimmed, clampedMax);
    const resultSet = parser.parse();
    return { pages: toSortedArray(resultSet) };
  } catch (err) {
    if (options?.strict) {
      throw err;
    }
    const pages = toSortedArray(parseCsvFallback(trimmed, clampedMax));
    const tokens = trimmed.split(',').map(t => t.trim()).filter(Boolean);
    const bad = tokens.find(tok => !/^(\d+\s*-\s*\d+|\d+)$/.test(tok));
    const warning = `Malformed expression${bad ? ` at: '${bad}'` : ''}. Falling back to CSV interpretation.`;
    return { pages, warning };
  }
}

function toSortedArray(set: Set<number>): number[] {
  return Array.from(set).sort((a, b) => a - b);
}

function parseCsvFallback(input: string, max: number): Set<number> {
  const result = new Set<number>();
  const parts = input.split(',').map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = clampToRange(parseInt(rangeMatch[1], 10), 1, max);
      const end = clampToRange(parseInt(rangeMatch[2], 10), 1, max);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const [lo, hi] = start <= end ? [start, end] : [end, start];
        for (let i = lo; i <= hi; i++) result.add(i);
      }
      continue;
    }
    // Accept only pure positive integers (no signs, no letters)
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (Number.isFinite(n) && n >= 1 && n <= max) result.add(n);
    }
  }
  return result;
}

function clampToRange(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return NaN as unknown as number;
  return Math.min(Math.max(v, min), max);
}

class ExpressionParser {
  private readonly src: string;
  private readonly max: number;
  private idx: number = 0;

  constructor(source: string, maxPages: number) {
    this.src = source;
    this.max = maxPages;
  }

  parse(): Set<number> {
    this.skipWs();
    const set = this.parseDisjunction();
    this.skipWs();
    // If there are leftover non-space characters, treat as error
    if (this.idx < this.src.length) {
      throw new Error('Unexpected trailing input');
    }
    return set;
  }

  private parseDisjunction(): Set<number> {
    let left = this.parseConjunction();
    while (true) {
      this.skipWs();
      const op = this.peekWordOrSymbol();
      if (!op) break;
      if (op.type === 'symbol' && (op.value === ',' || op.value === '|')) {
        this.consume(op.length);
        const right = this.parseConjunction();
        left = union(left, right);
        continue;
      }
      if (op.type === 'word' && op.value === 'or') {
        this.consume(op.length);
        const right = this.parseConjunction();
        left = union(left, right);
        continue;
      }
      break;
    }
    return left;
  }

  private parseConjunction(): Set<number> {
    let left = this.parseUnary();
    while (true) {
      this.skipWs();
      const op = this.peekWordOrSymbol();
      if (!op) break;
      if (op.type === 'symbol' && op.value === '&') {
        this.consume(op.length);
        const right = this.parseUnary();
        left = intersect(left, right);
        continue;
      }
      if (op.type === 'word' && op.value === 'and') {
        this.consume(op.length);
        const right = this.parseUnary();
        left = intersect(left, right);
        continue;
      }
      break;
    }
    return left;
  }

  private parseUnary(): Set<number> {
    this.skipWs();
    if (this.peek('!')) {
      this.consume(1);
      const inner = this.parseUnary();
      return complement(inner, this.max);
    }
    // Word-form NOT
    if (this.tryConsumeNot()) {
      const inner = this.parseUnary();
      return complement(inner, this.max);
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Set<number> {
    this.skipWs();

    // Parenthesized expression: '(' expression ')'
    if (this.peek('(')) {
      this.consume(1);
      const inner = this.parseDisjunction();
      this.skipWs();
      if (!this.peek(')')) throw new Error('Expected )');
      this.consume(1);
      return inner;
    }

    // Keywords: even / odd
    const keyword = this.tryReadKeyword();
    if (keyword) {
      if (keyword === 'even') return this.buildEven();
      if (keyword === 'odd') return this.buildOdd();
    }

    // Progression: k n ( +/- c )?
    const progression = this.tryReadProgression();
    if (progression) {
      return this.buildProgression(progression.k, progression.c);
    }

    // Number or Range
    const num = this.tryReadNumber();
    if (num !== null) {
      this.skipWs();
      if (this.peek('-')) {
        // Range
        this.consume(1);
        this.skipWs();
        const end = this.readRequiredNumber();
        return this.buildRange(num, end);
      }
      return this.buildSingleton(num);
    }

    // If nothing matched, error
    throw new Error('Expected primary');
  }

  private buildSingleton(n: number): Set<number> {
    const set = new Set<number>();
    if (n >= 1 && n <= this.max) set.add(n);
    return set;
  }

  private buildRange(a: number, b: number): Set<number> {
    const set = new Set<number>();
    let start = a, end = b;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return set;
    if (start > end) [start, end] = [end, start];
    start = Math.max(1, start);
    end = Math.min(this.max, end);
    for (let i = start; i <= end; i++) set.add(i);
    return set;
  }

  private buildProgression(k: number, c: number): Set<number> {
    const set = new Set<number>();
    if (!(k >= 1)) return set;
    // n starts at 0: k*n + c, for n=0,1,2,... while within [1..max]
    for (let n = 0; ; n++) {
      const value = k * n + c;
      if (value > this.max) break;
      if (value >= 1) set.add(value);
    }
    return set;
  }

  private buildEven(): Set<number> {
    return this.buildProgression(2, 0);
  }

  private buildOdd(): Set<number> {
    return this.buildProgression(2, -1);
  }

  private tryReadKeyword(): 'even' | 'odd' | null {
    const start = this.idx;
    const word = this.readWord();
    if (!word) return null;
    const lower = word.toLowerCase();
    if (lower === 'even' || lower === 'odd') {
      return lower as 'even' | 'odd';
    }
    // Not a keyword; rewind
    this.idx = start;
    return null;
  }

  private tryReadProgression(): { k: number; c: number } | null {
    const start = this.idx;
    this.skipWs();
    const k = this.tryReadNumber();
    if (k === null) {
      this.idx = start;
      return null;
    }
    this.skipWs();
    // Optional '*'
    if (this.peek('*')) this.consume(1);
    this.skipWs();
    if (!this.peek('n') && !this.peek('N')) {
      this.idx = start;
      return null;
    }
    this.consume(1); // consume 'n'
    this.skipWs();
    // Optional (+|-) c
    let c = 0;
    if (this.peek('+') || this.peek('-')) {
      const sign = this.src[this.idx];
      this.consume(1);
      this.skipWs();
      const cVal = this.tryReadNumber();
      if (cVal === null) {
        this.idx = start;
        return null;
      }
      c = sign === '-' ? -cVal : cVal;
    }
    return { k, c };
  }

  private tryReadNumber(): number | null {
    this.skipWs();
    const m = this.src.slice(this.idx).match(/^(\d+)/);
    if (!m) return null;
    this.consume(m[1].length);
    const num = parseInt(m[1], 10);
    return Number.isFinite(num) ? num : null;
  }

  private readRequiredNumber(): number {
    const n = this.tryReadNumber();
    if (n === null) throw new Error('Expected number');
    return n;
  }

  private readWord(): string | null {
    this.skipWs();
    const m = this.src.slice(this.idx).match(/^([A-Za-z]+)/);
    if (!m) return null;
    this.consume(m[1].length);
    return m[1];
  }

  private tryConsumeNot(): boolean {
    const start = this.idx;
    const word = this.readWord();
    if (!word) {
      this.idx = start;
      return false;
    }
    if (word.toLowerCase() === 'not') {
      return true;
    }
    this.idx = start;
    return false;
  }

  private peekWordOrSymbol(): { type: 'word' | 'symbol'; value: string; raw: string; length: number } | null {
    this.skipWs();
    if (this.idx >= this.src.length) return null;
    const ch = this.src[this.idx];
    if (/[A-Za-z]/.test(ch)) {
      const start = this.idx;
      const word = this.readWord();
      if (!word) return null;
      const lower = word.toLowerCase();
      // Always rewind; the caller will consume if it uses this token
      const len = word.length;
      this.idx = start;
      if (lower === 'and' || lower === 'or') {
        return { type: 'word', value: lower, raw: word, length: len };
      }
      return null;
    }
    if (ch === '&' || ch === '|' || ch === ',') {
      return { type: 'symbol', value: ch, raw: ch, length: 1 };
    }
    return null;
  }

  private skipWs() {
    while (this.idx < this.src.length && /\s/.test(this.src[this.idx])) this.idx++;
  }

  private peek(s: string): boolean {
    return this.src.startsWith(s, this.idx);
  }

  private consume(n: number) {
    this.idx += n;
  }
}

function union(a: Set<number>, b: Set<number>): Set<number> {
  if (a.size === 0) return new Set(b);
  if (b.size === 0) return new Set(a);
  const out = new Set<number>(a);
  for (const v of b) out.add(v);
  return out;
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  if (a.size === 0 || b.size === 0) return new Set<number>();
  const out = new Set<number>();
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (large.has(v)) out.add(v);
  return out;
}

function complement(a: Set<number>, max: number): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i <= max; i++) if (!a.has(i)) out.add(i);
  return out;
}


