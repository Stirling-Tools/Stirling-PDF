export interface MatchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  ignoreAccents?: boolean;
}

export interface TextMatch {
  start: number;
  end: number;
}

const ASCII_MAX = 0x7f;
const COMBINING_MARK = /\p{M}/gu;
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

/** Scanned rather than matched: a regex for this needs control characters. */
function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) > ASCII_MAX) return false;
  }
  return true;
}

// Length-stable fold: index i of the result maps to index i of the input, so
// match offsets stay valid against the untouched original.
export function foldForSearch(text: string, opts: MatchOptions = {}): string {
  const lower = opts.matchCase !== true;
  const strip = opts.ignoreAccents === true;
  if (!lower && !strip) return text;
  // ASCII can never change length under either fold, and this is the hot path.
  if (isAscii(text)) return lower ? text.toLowerCase() : text;
  let out = "";
  for (const ch of text) out += foldChar(ch, lower, strip);
  return out;
}

function foldChar(ch: string, lower: boolean, strip: boolean): string {
  let c = ch;
  if (lower) {
    const lowered = c.toLowerCase();
    if (lowered.length === c.length) c = lowered;
  }
  if (strip) {
    const stripped = c.normalize("NFD").replace(COMBINING_MARK, "");
    if (stripped.length === c.length) c = stripped;
  }
  return c;
}

export function isWordChar(ch: string | null): boolean {
  return ch !== null && ch.length > 0 && WORD_CHAR.test(ch);
}

function codePointAt(text: string, index: number): string | null {
  if (index < 0 || index >= text.length) return null;
  const cp = text.codePointAt(index);
  return cp === undefined ? null : String.fromCodePoint(cp);
}

function codePointBefore(text: string, index: number): string | null {
  if (index <= 0 || index > text.length) return null;
  const unit = text.charCodeAt(index - 1);
  if (unit >= 0xdc00 && unit <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
  }
  return text.charAt(index - 1);
}

function isWholeWordAt(text: string, start: number, end: number): boolean {
  return (
    !isWordChar(codePointBefore(text, start)) &&
    !isWordChar(codePointAt(text, end))
  );
}

/** Non-overlapping matches, left to right. Offsets index the original. */
export function findMatches(
  haystack: string,
  needle: string,
  opts: MatchOptions = {},
): TextMatch[] {
  if (needle.length === 0 || needle.length > haystack.length) return [];
  const hay = foldForSearch(haystack, opts);
  const pin = foldForSearch(needle, opts);
  if (pin.length === 0 || pin.length > hay.length) return [];
  const out: TextMatch[] = [];
  let from = 0;
  while (from <= hay.length - pin.length) {
    const at = hay.indexOf(pin, from);
    if (at < 0) break;
    const end = at + pin.length;
    if (opts.wholeWord === true && !isWholeWordAt(haystack, at, end)) {
      from = at + 1;
      continue;
    }
    out.push({ start: at, end });
    from = end;
  }
  return out;
}

/** Literal splice: `$&` and friends in `replacement` are inserted verbatim. */
export function replaceMatch(
  text: string,
  match: TextMatch,
  replacement: string,
): string {
  if (match.start < 0 || match.end > text.length || match.start > match.end) {
    return text;
  }
  return text.slice(0, match.start) + replacement + text.slice(match.end);
}

/** Same literal semantics as replaceMatch, for an ordered non-overlapping list. */
export function replaceMatches(
  text: string,
  matches: TextMatch[],
  replacement: string,
): string {
  if (matches.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor || m.end > text.length || m.start > m.end) continue;
    out += text.slice(cursor, m.start) + replacement;
    cursor = m.end;
  }
  return out + text.slice(cursor);
}
