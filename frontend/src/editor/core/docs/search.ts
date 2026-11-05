/**
 * Full-text search over the docs manifest. Pure + dependency-free so it's unit
 * testable. Indexes each doc's title + plaintext body; ranks title matches above
 * body matches; returns highlighted title + a content snippet per hit.
 */

export interface SearchDoc {
  id: string;
  title: string;
  sectionLabel: string;
  /** Plaintext body (markdown stripped), original case. */
  text: string;
}

/** A run of result text, flagged when it matches a query term (for <mark>). */
export interface Segment {
  text: string;
  hit: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  sectionLabel: string;
  titleSegments: Segment[];
  snippet: Segment[];
  score: number;
}

/** Strip markdown/MDX down to readable plaintext for indexing + snippets. */
export function toPlainText(md: string): string {
  return md
    .replace(/^(```|~~~).*$/gm, " ") // fence delimiters (keep the code text)
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/^\s{0,3}>\s?/gm, "") // blockquotes
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*+]\s+/gm, "") // list bullets
    .replace(/[*_~]/g, "") // emphasis marks
    .replace(/\|/g, " ") // table pipes
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return count;
}

/** Split `text` into segments, flagging any run that matches a query term. */
export function highlight(text: string, terms: string[]): Segment[] {
  const cleaned = terms.map(escapeRegExp).filter(Boolean);
  if (!cleaned.length) return [{ text, hit: false }];
  const re = new RegExp(`(${cleaned.join("|")})`, "gi");
  const segments: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ text: text.slice(last, m.index), hit: false });
    }
    segments.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: false });
  return segments.length ? segments : [{ text, hit: false }];
}

/** Build a ~context-window snippet around the earliest term match. */
export function buildSnippet(
  text: string,
  terms: string[],
  radius = 90,
): Segment[] {
  const lower = text.toLowerCase();
  let pos = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) {
    const head = text.slice(0, radius * 2);
    return highlight(head + (text.length > head.length ? "…" : ""), terms);
  }
  let start = Math.max(0, pos - radius);
  let end = Math.min(text.length, pos + radius);
  // Snap to word boundaries so we don't slice mid-word.
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < pos) start = space + 1;
  }
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > pos) end = space;
  }
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return highlight(snippet, terms);
}

/**
 * Rank docs against a query. A doc matches when every term appears in its title
 * or body; title hits score highest.
 */
export function searchDocs(
  docs: SearchDoc[],
  query: string,
  limit = 40,
): SearchResult[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];

  const results: SearchResult[] = [];
  for (const doc of docs) {
    const titleLower = doc.title.toLowerCase();
    const textLower = doc.text.toLowerCase();
    const matchesAll = terms.every(
      (term) => titleLower.includes(term) || textLower.includes(term),
    );
    if (!matchesAll) continue;

    let score = 0;
    for (const term of terms) {
      if (titleLower.includes(term)) score += 10;
      if (titleLower.startsWith(term)) score += 5;
      score += Math.min(countOccurrences(textLower, term), 5);
    }

    results.push({
      id: doc.id,
      title: doc.title,
      sectionLabel: doc.sectionLabel,
      titleSegments: highlight(doc.title, terms),
      snippet: buildSnippet(doc.text, terms),
      score,
    });
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.slice(0, limit);
}
