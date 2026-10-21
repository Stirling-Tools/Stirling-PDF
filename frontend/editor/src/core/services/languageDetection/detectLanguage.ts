import LANGUAGE_DATA from "@app/services/languageDetection/languages.json";
import type {
  LanguageCandidate,
  LanguageDetection,
} from "@app/services/languageDetection/types";

export type {
  LanguageCandidate,
  LanguageDetection,
} from "@app/services/languageDetection/types";

const LETTERS = /\p{L}/gu;
const LATIN_LETTER = /[a-z]/gi;
const WORD = /[\p{L}']+/gu;

// ASCII whitespace plus the no-break spaces pdf.js extraction commonly emits.
// oxlint-disable-next-line no-control-regex -- vertical tab is intentional ASCII whitespace
const WHITESPACE = /[\t\n\x0B\f\r   ]+/g;
const CURLY_APOSTROPHE = /[‘’]/g;
const COMBINING_MARKS = /[\u0300-\u036F]/g;
const FOLD_PAIRS: [RegExp, string][] = [
  [/ß/g, "ss"],
  [/æ/g, "ae"],
  [/œ/g, "oe"],
  [/ø/g, "o"],
  [/ł/g, "l"],
  [/đ|ð/g, "d"],
  [/ı/g, "i"],
  [/þ/g, "th"],
];
const LIGATURE_FI = /ﬁ/g;
const LIGATURE_FL = /ﬂ/g;

interface ScriptGroup {
  id: string;
  range: RegExp;
  languages: string[];
}

interface LanguageProfile {
  language: string;
  words: Set<string>;
  chars: RegExp | null;
}

interface RawScript {
  id?: unknown;
  range?: unknown;
  languages?: unknown;
}

interface RawProfile {
  language?: unknown;
  words?: unknown;
  chars?: unknown;
}

interface LanguagesFile {
  english?: { words?: unknown };
  scripts?: RawScript[];
  latin?: { languages?: unknown };
  profiles?: RawProfile[];
}

const languages = LANGUAGE_DATA as LanguagesFile;

const ENGLISH_WORDS = new Set<string>(
  strings(languages.english?.words).map((w) => fold(w.toLowerCase())),
);

const SCRIPTS: ScriptGroup[] = (languages.scripts ?? []).flatMap((s) => {
  const range = compileRegex(str(s.range), "g");
  const langs = strings(s.languages);
  if (range == null || langs.length === 0) return [];
  return [{ id: str(s.id) ?? langs[0], range, languages: langs }];
});

const LATIN_LANGUAGES: string[] = strings(languages.latin?.languages);

const PROFILES = new Map<string, LanguageProfile>(
  (languages.profiles ?? []).flatMap((p) => {
    const language = str(p.language);
    if (language == null) return [];
    return [
      [
        language,
        {
          language,
          words: new Set(strings(p.words).map((w) => fold(w.toLowerCase()))),
          chars: compileRegex(str(p.chars), "g"),
        },
      ] as const,
    ];
  }),
);

const MIN_WORDS_FOR_FOREIGN = 12;
const MIN_DISTINCTIVE_CHARS = 3;
const MIN_WORD_HITS = 2;
const SCRIPT_SHARE = 0.25;

/**
 * Identify the language of text extracted from a document.
 *
 * The detector is deliberately dependency-free: it identifies scripts by
 * character range and Latin languages by function-word and diacritic profiles.
 * That is enough to choose a speech voice without shipping a multi-hundred-
 * kilobyte language model, and it degrades to `assumed`/`lowText` rather than
 * guessing when a page is mostly numbers or too short to judge.
 */
export function detectLanguage(text: string): LanguageDetection {
  const raw = nz(text);
  const letters = countAll(LETTERS, raw);
  if (letters < 25) {
    return {
      language: null,
      script: null,
      candidates: [],
      assumed: false,
      lowText: true,
    };
  }

  const words = allMatches(WORD, normalize(raw));
  const totalWords = Math.max(words.length, 1);

  for (const script of SCRIPTS) {
    if (countAll(script.range, raw) / letters <= SCRIPT_SHARE) continue;
    if (script.languages.length === 1) {
      const only = script.languages[0];
      return {
        language: only,
        script: script.id,
        candidates: [{ language: only, score: 1 }],
        assumed: false,
        lowText: false,
      };
    }
    const candidates = rankLanguages(raw, words, totalWords, script.languages);
    return {
      language: candidates[0]?.language ?? script.languages[0],
      script: script.id,
      candidates,
      assumed: false,
      lowText: false,
    };
  }

  const latinRatio = countAll(LATIN_LETTER, fold(raw)) / letters;
  const lowText = totalWords < 30;

  let englishHits = 0;
  const englishSeen = new Set<string>();
  for (const w of words) {
    if (ENGLISH_WORDS.has(w)) {
      englishHits++;
      englishSeen.add(w);
    }
  }
  const englishScore = englishHits / totalWords;

  const candidates = rankLanguages(raw, words, totalWords, LATIN_LANGUAGES);
  const best = candidates[0];
  const bestProfile = best == null ? null : PROFILES.get(best.language);
  let bestDistinct = 0;
  if (bestProfile != null) {
    const seen = new Set<string>();
    for (const w of words) if (bestProfile.words.has(w)) seen.add(w);
    bestDistinct = seen.size;
  }
  const bestChars =
    bestProfile?.chars == null ? 0 : countAll(bestProfile.chars, raw);
  const bestRatio =
    bestProfile == null ? 0 : countWords(words, bestProfile).total / totalWords;

  // Affirmative evidence of a specific other language, not merely an absence of
  // English: a shared function word or stray accent must not unseat English.
  const foreignEvidence = bestDistinct >= 3 || bestChars >= 6;
  const foreignWins =
    latinRatio >= 0.7 &&
    totalWords >= MIN_WORDS_FOR_FOREIGN &&
    foreignEvidence &&
    (bestChars >= 3 || bestRatio >= 0.1) &&
    (best?.score ?? 0) > englishScore * 1.2 &&
    (englishScore < 0.04 || bestRatio > englishScore * 1.5);

  if (foreignWins) {
    return {
      language: best?.language ?? null,
      script: "latin",
      candidates,
      assumed: false,
      lowText,
    };
  }

  const bar = lowText ? 0.03 : 0.045;
  const englishProven =
    latinRatio >= 0.75 &&
    englishScore >= bar &&
    englishSeen.size >= MIN_WORD_HITS;
  const englishAssumed = latinRatio >= 0.75 && !foreignEvidence;
  if (!englishProven && !englishAssumed) {
    return {
      language: null,
      script: latinRatio >= 0.7 ? "latin" : null,
      candidates,
      assumed: false,
      lowText,
    };
  }
  return {
    language: "en",
    script: "latin",
    candidates: [{ language: "en", score: englishScore }, ...candidates],
    assumed: !englishProven,
    lowText,
  };
}

function countWords(
  words: string[],
  profile: LanguageProfile,
): { total: number; distinct: number } {
  let total = 0;
  const seen = new Set<string>();
  for (const w of words) {
    if (profile.words.has(w)) {
      total++;
      seen.add(w);
    }
  }
  return { total, distinct: seen.size };
}

function rankLanguages(
  raw: string,
  words: string[],
  totalWords: number,
  candidates: readonly string[],
): LanguageCandidate[] {
  const ranked: (LanguageCandidate & { tiebreak: number })[] = [];
  for (const language of candidates) {
    const profile = PROFILES.get(language);
    if (profile == null) continue;
    const chars = profile.chars == null ? 0 : countAll(profile.chars, raw);
    const charEvidence = chars >= MIN_DISTINCTIVE_CHARS ? chars : 0;
    const hits = countWords(words, profile);
    if (hits.distinct < MIN_WORD_HITS && charEvidence === 0) continue;
    const ratio = hits.total / totalWords;
    const score = ratio + Math.min(charEvidence / totalWords, 0.15) * 6;
    const tiebreak = chars / totalWords;
    if (score > 0 || tiebreak > 0) ranked.push({ language, score, tiebreak });
  }
  ranked.sort((a, b) => b.score - a.score || b.tiebreak - a.tiebreak);
  return ranked.map(({ language, score }) => ({ language, score }));
}

function nz(s: string | null | undefined): string {
  return s == null ? "" : s;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

function normalize(text: string | null | undefined): string {
  return fold(
    nz(text)
      .toLowerCase()
      .replace(CURLY_APOSTROPHE, "'")
      .replace(LIGATURE_FI, "fi")
      .replace(LIGATURE_FL, "fl")
      .replace(WHITESPACE, " "),
  );
}

function fold(text: string): string {
  let out = text.normalize("NFD").replace(COMBINING_MARKS, "");
  for (const [re, to] of FOLD_PAIRS) out = out.replace(re, to);
  return out;
}

function compileRegex(pattern: string | null, flagStr: string): RegExp | null {
  if (pattern == null) return null;
  try {
    const fl = flagStr.length === 0 ? "gi" : flagStr;
    let f = "g"; // always global for iterative counting
    if (fl.indexOf("i") >= 0) f += "i";
    if (fl.indexOf("m") >= 0) f += "m";
    if (fl.indexOf("s") >= 0) f += "s";
    return new RegExp(pattern, f);
  } catch {
    return null;
  }
}

function countAll(re: RegExp, text: string | null): number {
  if (text == null || text.length === 0) return 0;
  re.lastIndex = 0;
  let count = 0;
  for (;;) {
    const m = re.exec(text);
    if (m == null) break;
    count++;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return count;
}

function allMatches(re: RegExp, text: string | null): string[] {
  if (text == null || text.length === 0) return [];
  re.lastIndex = 0;
  const out: string[] = [];
  for (;;) {
    const m = re.exec(text);
    if (m == null) break;
    out.push(m[0]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}
