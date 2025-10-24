// Lightweight fuzzy search helpers without external deps
// Provides diacritics-insensitive normalization and Levenshtein distance scoring

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .trim();
}

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
        prev[j - 1] + cost // substitution
      );
    }
    for (let j = 0; j <= bLen; j++) prev[j] = curr[j];
  }
  return curr[bLen];
}

// Compute a heuristic match score (higher is better)
// 1) Exact/substring hits get high base; 2) otherwise use normalized Levenshtein distance
export function scoreMatch(queryRaw: string, targetRaw: string): number {
  const query = normalizeText(queryRaw);
  const target = normalizeText(targetRaw);
  if (!query) return 0;
  if (target.includes(query)) {
    // Reward earlier/shorter substring matches
    const pos = target.indexOf(query);
    return 100 - pos - Math.max(0, target.length - query.length);
  }

  // Token-aware: check each word token too, but require better similarity
  const tokens = target.split(/[^a-z0-9]+/g).filter(Boolean);
  for (const token of tokens) {
    if (token.includes(query)) {
      // Only give high score if the match is substantial (not just "and" matching)
      const similarity = query.length / Math.max(query.length, token.length);
      if (similarity >= 0.6) { // Require at least 60% similarity
        return 80 - Math.abs(token.length - query.length);
      }
    }
  }

  const distance = levenshtein(query, target.length > 64 ? target.slice(0, 64) : target);
  const maxLen = Math.max(query.length, target.length, 1);
  const similarity = 1 - distance / maxLen; // 0..1
  return Math.floor(similarity * 60); // scale below substring scores
}

export function minScoreForQuery(query: string): number {
  const len = normalizeText(query).length;
  if (len <= 3) return 40; 
  if (len <= 6) return 30; 
  return 25; 
}

// Decide if a target matches a query based on a threshold
export function isFuzzyMatch(query: string, target: string, minScore?: number): boolean {
  const threshold = typeof minScore === 'number' ? minScore : minScoreForQuery(query);
  return scoreMatch(query, target) >= threshold;
}

// Convenience: rank a list of items by best score across provided getters
export function rankByFuzzy<T>(items: T[], query: string, getters: Array<(item: T) => string>, minScore?: number): Array<{ item: T; score: number; matchedText?: string }>{
  const results: Array<{ item: T; score: number; matchedText?: string }> = [];
  const threshold = typeof minScore === 'number' ? minScore : minScoreForQuery(query);
  for (const item of items) {
    let best = 0;
    let matchedText = '';
    for (const get of getters) {
      const value = get(item);
      if (!value) continue;
      const s = scoreMatch(query, value);
      if (s > best) {
        best = s;
        matchedText = value;
      }
      if (best >= 95) {
        break;
      }
    }
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
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ');
  return normalizeText(spaced);
}


