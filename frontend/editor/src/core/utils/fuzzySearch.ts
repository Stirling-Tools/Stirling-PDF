// Lightweight fuzzy search helpers without external deps.
// Diacritics-insensitive, word-aware matching with a small typo tolerance.

function normalizeText(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      // Punctuation reads as a space, so "pdf/a", "pdf-a" and "pdf a" agree.
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

// Scripts written without spaces between words: a match inside a run of these
// characters is still a word match, so the word-boundary rule can't apply.
const UNSPACED_SCRIPT_CHARS = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}`;
const UNSPACED_SCRIPT = new RegExp(`[${UNSPACED_SCRIPT_CHARS}]`, "u");
const UNSPACED_RUN = new RegExp(`[${UNSPACED_SCRIPT_CHARS}]+`, "gu");

// An unspaced run is its own token, so "PDF转Word" yields "pdf", "转", "word".
function tokenize(normalized: string): string[] {
  return normalized
    .replace(UNSPACED_RUN, " $& ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Filler that rides along in natural queries ("compress pdf", "pdf to word")
// but rarely names what's wanted. Ignored unless the query is nothing else.
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "for",
  "in",
  "on",
  "my",
  "pdf",
  "pdfs",
  "file",
  "files",
  "document",
  "documents",
]);

// Basic Levenshtein distance (iterative with two rows)
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const prev = new Array(bLen + 1);
  const curr = new Array(bLen + 1);

  for (let j = 0; j <= bLen; j++) prev[j] = j;

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    const aChar = a.charCodeAt(i - 1);
    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= bLen; j++) prev[j] = curr[j];
  }
  return curr[bLen];
}

/**
 * How well one query word matches one target word, 0..1: exact > prefix >
 * substring > typo. Substrings must cover 60% of the word so short fragments
 * ("and" in "standard") don't count. Typos allow a small absolute number of
 * edits — a ratio isn't enough, since unrelated words can share half their
 * letters ("rotate" vs "update" is 3 edits of 6).
 */
function tokenTier(queryToken: string, targetToken: string): number {
  if (queryToken === targetToken) return 1;
  if (targetToken.startsWith(queryToken)) return 0.85;
  if (
    targetToken.includes(queryToken) &&
    queryToken.length / targetToken.length >= 0.6
  ) {
    return 0.7;
  }
  // The tail of a compound word ("data" in "metadata", "light" in
  // "highlight") is often a word in its own right; rank it low but keep it.
  if (queryToken.length >= 4 && targetToken.endsWith(queryToken)) return 0.55;
  // A near-miss of filler ("pdfa" vs "pdf") says nothing about the item.
  if (queryToken.length < 3 || STOPWORDS.has(targetToken)) return 0;
  const maxEdits = queryToken.length <= 4 ? 1 : 2;
  if (Math.abs(queryToken.length - targetToken.length) > maxEdits) return 0;
  const distance = levenshtein(queryToken, targetToken);
  if (distance > maxEdits) return 0;
  const similarity =
    1 - distance / Math.max(queryToken.length, targetToken.length);
  return 0.6 * similarity;
}

function bestTokenTier(queryToken: string, targetTokens: string[]): number {
  let best = 0;
  for (const token of targetTokens) {
    const tier = tokenTier(queryToken, token);
    if (tier > best) best = tier;
    if (best === 1) break;
  }
  return best;
}

/**
 * The words of a query that must match. Empty when every word is filler
 * ("pdf", "pdf/a"): those only match as a whole phrase, since word by word
 * they'd hit nearly every tool.
 */
function contentTokens(query: string): string[] {
  return tokenize(query).filter((token) => !STOPWORDS.has(token));
}

/** Score for a query whose every content word matched, from the mean tier. */
function tokenCoverageScore(tiers: number[]): number {
  const mean = tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length;
  return Math.round(45 + 35 * mean);
}

function isWordStart(target: string, index: number): boolean {
  if (index === 0) return true;
  const prev = target[index - 1];
  return /[^\p{L}\p{N}]/u.test(prev) || UNSPACED_SCRIPT.test(prev);
}

/**
 * @param queryTokens the query's content words (contentTokens), and
 * @param targetTokens the target's words (tokenize) — passed in so a ranker
 *   scoring many fields per keystroke derives each only once.
 * @param anywhere also accept the whole query mid-word, for identifier-like
 *   fields (file names, emails) searched by fragment ("2024" in
 *   "Invoice2024Final.pdf"). Prose fields leave it off, so a fragment there
 *   must start a word, cover most of one, or end one (see tokenTier).
 */
function scoreNormalized(
  query: string,
  queryTokens: string[],
  target: string,
  targetTokens: string[],
  anywhere = false,
): number {
  if (!query || !target) return 0;
  if (target === query) return 100;

  // Whole-query hits on the field read as the strongest intent: "add pass"
  // completing "Add Password". Length matters only as a small tie-breaker so
  // long fields (descriptions, synonym phrases) aren't buried.
  if (target.startsWith(query)) {
    return 95 - Math.min(5, Math.floor((target.length - query.length) / 8));
  }
  const unspaced = UNSPACED_SCRIPT.test(query);
  const firstPos = target.indexOf(query, 1);
  for (let pos = firstPos; pos !== -1; pos = target.indexOf(query, pos + 1)) {
    if (unspaced || isWordStart(target, pos)) {
      return 85 - Math.min(5, Math.floor(pos / 8));
    }
  }
  if (anywhere && firstPos !== -1 && query.length >= 2) {
    return 70 - Math.min(5, Math.floor(firstPos / 8));
  }

  // Word-by-word: every content word must find a match somewhere in the field.
  const tiers: number[] = [];
  for (const token of queryTokens) {
    const tier = bestTokenTier(token, targetTokens);
    if (tier === 0) return 0;
    tiers.push(tier);
  }
  return tiers.length > 0 ? tokenCoverageScore(tiers) : 0;
}

/** Match score 0..100 of a query against one field (higher is better). */
export function scoreMatch(queryRaw: string, targetRaw: string): number {
  const query = normalizeText(queryRaw);
  const target = normalizeText(targetRaw);
  return scoreNormalized(query, contentTokens(query), target, tokenize(target));
}

/** Lowest score any fuzzy match can pass with (see minScoreForQuery). Rankers
 * that mix fuzzy results with fixed-score entries key off this to stay below
 * every real match. */
export const FUZZY_MIN_SCORE = 30;

export function minScoreForQuery(query: string): number {
  const len = normalizeText(query).length;
  return len <= 3 ? 40 : FUZZY_MIN_SCORE;
}

// Decide if a target matches a query based on a threshold
export function isFuzzyMatch(
  query: string,
  target: string,
  minScore?: number,
): boolean {
  const threshold =
    typeof minScore === "number" ? minScore : minScoreForQuery(query);
  return scoreMatch(query, target) >= threshold;
}

type FuzzyFieldValue = string | readonly string[] | null | undefined;

/**
 * A searchable field of an item. A list value (synonyms, keywords) is scored
 * phrase by phrase rather than joined, so one exact tag isn't diluted by the
 * rest. `weight` (default 1) scales the field's score — e.g. below 1 for a
 * description, so a name hit outranks the same hit buried in prose.
 * `anywhere` lets a fragment match mid-word (see scoreNormalized).
 */
export type FuzzyField<T> =
  | ((item: T) => FuzzyFieldValue)
  | {
      get: (item: T) => FuzzyFieldValue;
      weight?: number;
      anywhere?: boolean;
    };

// A query matched only by combining fields ("rotate landscape": name + tag)
// ranks below the same coverage within a single field.
const CROSS_FIELD_PENALTY = 5;

// Convenience: rank a list of items by best score across provided fields
export function rankByFuzzy<T>(
  items: T[],
  query: string,
  fields: Array<FuzzyField<T>>,
  minScore?: number,
): Array<{ item: T; score: number; matchedText?: string }> {
  const results: Array<{ item: T; score: number; matchedText?: string }> = [];
  const threshold =
    typeof minScore === "number" ? minScore : minScoreForQuery(query);
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return results;
  const queryTokens = contentTokens(normalizedQuery);
  const resolved = fields.map((field) =>
    typeof field === "function"
      ? { get: field, weight: 1, anywhere: false }
      : { weight: 1, anywhere: false, ...field },
  );

  for (const item of items) {
    let best = 0;
    let matchedText = "";
    // Per content word, its best weighted tier across every field.
    const crossTiers = queryTokens.map(() => 0);

    for (const { get, weight, anywhere } of resolved) {
      const value = get(item);
      if (!value) continue;
      const phrases = typeof value === "string" ? [value] : value;
      for (const phrase of phrases) {
        if (!phrase) continue;
        const normalized = normalizeText(phrase);
        const tokens = tokenize(normalized);
        const s =
          scoreNormalized(
            normalizedQuery,
            queryTokens,
            normalized,
            tokens,
            anywhere,
          ) * weight;
        if (s > best) {
          best = s;
          matchedText = phrase;
        }
        if (queryTokens.length > 1) {
          queryTokens.forEach((token, i) => {
            const tier = bestTokenTier(token, tokens) * weight;
            if (tier > crossTiers[i]) crossTiers[i] = tier;
          });
        }
      }
    }

    if (queryTokens.length > 1 && crossTiers.every((tier) => tier > 0)) {
      best = Math.max(
        best,
        tokenCoverageScore(crossTiers) - CROSS_FIELD_PENALTY,
      );
    }
    best = Math.round(best);
    if (best >= threshold) results.push({ item, score: best, matchedText });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

export function normalizeForSearch(text: string): string {
  return normalizeText(text);
}

// Convert ids like "addPassword", "add-password", "add_password" to words for matching
export function idToWords(id: string): string {
  const spaced = id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ");
  return normalizeText(spaced);
}
