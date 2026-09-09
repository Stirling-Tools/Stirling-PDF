// Heuristic (non-AI) document classifier: string/regex/structural scoring over
// extracted text, filename and metadata. Rules lazy-load as a separate chunk.

import type {
  HeuristicConfidence,
  HeuristicDoc,
  HeuristicExplanation,
  HeuristicResult,
} from "@app/services/heuristic/types";

export type {
  HeuristicConfidence,
  HeuristicDoc,
  HeuristicExplanation,
  HeuristicResult,
};

// --- scoring constants ---
const ZONE_MULT: Record<string, number> = { title: 2.0, first: 1.35, any: 1.0 };
const FLOOR = 18;
const HIGH_SCORE = 45;
const HIGH_MARGIN = 15;
const HIGH_SIGNALS = 3;
const MED_SCORE = 28;
const MED_MARGIN = 8;
const SEC_FLOOR = 28;
const SEC_FRAC = 0.5;
const SEC_SIGNALS = 2;
const SEC_MAX = 4;

const STOPWORDS = new Set<string>([
  "the",
  "and",
  "of",
  "to",
  "in",
  "is",
  "that",
  "for",
  "on",
  "with",
  "as",
  "are",
  "this",
  "be",
  "by",
  "at",
  "from",
  "or",
  "an",
  "not",
  "your",
  "you",
  "we",
  "has",
  "have",
  "will",
  "was",
  "were",
  "been",
  "their",
  "they",
  "which",
  "any",
  "all",
  "may",
  "shall",
  "if",
  "can",
  "our",
  "its",
  "it",
  "no",
  "but",
  "other",
  "than",
  "these",
  "such",
  "must",
  "each",
  "per",
  "under",
  "more",
  "when",
  "also",
  "into",
  "only",
  "should",
  "would",
]);

// Non-Latin scripts end English classification outright when they dominate.
const SCRIPT_RANGES: RegExp[] = [
  /[一-鿿぀-ヿ]/g, // CJK + Kana
  /[가-힯ᄀ-ᇿ]/g, // Hangul
  /[Ѐ-ӿ]/g, // Cyrillic
  /[؀-ۿݐ-ݿ]/g, // Arabic
  /[Ͱ-Ϳ]/g, // Greek
  /[ऀ-ॿ]/g, // Devanagari
  /[֐-׿]/g, // Hebrew
  /[฀-๿]/g, // Thai
];

interface LatinProfile {
  words: Set<string>;
  dia: RegExp | null;
}

// Function-word and diacritic profiles for common Latin-script languages.
const LATIN_PROFILES: LatinProfile[] = [
  {
    words: new Set([
      "el",
      "los",
      "las",
      "que",
      "para",
      "una",
      "por",
      "según",
      "más",
    ]),
    dia: /[áéíóúñ¿¡]/g,
  },
  {
    words: new Set([
      "le",
      "les",
      "des",
      "une",
      "est",
      "pour",
      "avec",
      "dans",
      "vous",
      "votre",
      "être",
      "nous",
      "cette",
      "sont",
      "été",
    ]),
    dia: /[àâçèéêëîïôùûœ]/g,
  },
  {
    words: new Set([
      "der",
      "die",
      "das",
      "und",
      "ist",
      "für",
      "mit",
      "von",
      "nicht",
      "ein",
      "eine",
      "werden",
      "wird",
      "bei",
      "sind",
      "dem",
    ]),
    dia: /[äöüß]/g,
  },
  {
    words: new Set([
      "il",
      "di",
      "che",
      "per",
      "con",
      "una",
      "del",
      "della",
      "sono",
      "questo",
      "essere",
      "più",
      "nel",
      "anche",
      "gli",
    ]),
    dia: /[àèéìòù]/g,
  },
  {
    words: new Set([
      "os",
      "as",
      "que",
      "para",
      "com",
      "uma",
      "por",
      "são",
      "não",
      "você",
      "está",
      "mais",
    ]),
    dia: /[ãõçáéíóúâêô]/g,
  },
  {
    words: new Set([
      "het",
      "een",
      "van",
      "voor",
      "met",
      "aan",
      "niet",
      "zijn",
      "wordt",
      "deze",
      "als",
      "bij",
      "ook",
      "naar",
    ]),
    dia: null,
  },
  {
    words: new Set([
      "och",
      "att",
      "det",
      "som",
      "på",
      "är",
      "av",
      "för",
      "med",
      "den",
      "till",
      "inte",
      "har",
      "ett",
      "du",
    ]),
    dia: /[åäö]/g,
  },
  {
    words: new Set([
      "nie",
      "jest",
      "się",
      "że",
      "oraz",
      "dla",
      "przez",
      "lub",
      "być",
      "może",
      "przy",
      "jak",
    ]),
    dia: /[ąćęłńśźż]/g,
  },
  {
    words: new Set([
      "ve",
      "bir",
      "bu",
      "için",
      "ile",
      "olarak",
      "olan",
      "gibi",
      "daha",
      "çok",
      "her",
      "kadar",
      "sonra",
    ]),
    dia: /[çğışöü]/g,
  },
];

// detectEnglish helper patterns (global for counting; \p{L} needs the u flag).
const LETTERS = /\p{L}/gu;
const LATIN_LETTER = /[a-z]/gi;
const WORD = /[\p{L}']+/gu;

// ASCII whitespace plus the no-break spaces pdf.js extraction commonly emits.
// eslint-disable-next-line no-control-regex -- vertical tab is intentional ASCII whitespace
const WHITESPACE = /[\t\n\x0B\f\r \u00A0\u2007\u202F]+/g;

// Structural signal patterns. Boolean-presence ones stay non-global (safe .test()),
// counting ones are global (used via countAll). Currency symbols are \u-escaped.
const CURRENCY = new RegExp(
  "[$£€]\\s?\\d[\\d,.]*|\\d[\\d,.]*\\s?(usd|gbp|eur)\\b",
  "gi",
);
const NUMERIC_TOKEN = new RegExp("^[\\d$£€.,%-]+$");
const DIGIT = /\d/;
const FORM_LABEL = /^[A-Za-z][A-Za-z /()&']{2,30}:\s*$/;
const UNDERSCORE4 = /_{4,}/;
const CHECKBOX = /[☐☑□■]\s/;
const DOT_LEADER = /\.{5,}\s*\d+\s*$/;
const BULLET = /^[•▪◦*-]\s+\S/;
const URL = /https?:\/\/|www\./gi;
const TOC = /table of contents/i;
const SIG1 = /\b(signature|signed by|authorized signature|\/s\/)\b/i;
const SIG2 = /_{6,}\s*\n\s*(date|name|sign)/i;
const REF1 = /\b(references|bibliography)\b/i;
const REF2 = /\[\d{1,3}\]|\(\d{4}\)/;
const EMAIL_FROM = /\bfrom:\s.+\n(.*\n){0,3}?\s*(to|sent|date):\s/i;
const EMAIL_SUBJ = /subject:\s/i;
const ADDRESS = /\b\d{5}(-\d{4})?\b|\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/g;

// --- prepared rule model ---
interface Phrase {
  text: string;
  weight: number;
  where: string;
}
interface Rx {
  re: RegExp;
  weight: number;
  where: string;
}
interface FileRx {
  re: RegExp;
  weight: number;
}
interface MetaRx {
  field: string;
  re: RegExp;
  weight: number;
}
interface Negative {
  text: string | null;
  re: RegExp | null;
  weight: number;
}
interface Structural {
  signal: string;
  weight: number;
}
interface PreparedLabel {
  id: string;
  emit: boolean;
  phrases: Phrase[];
  regexes: Rx[];
  filenames: FileRx[];
  metadata: MetaRx[];
  negatives: Negative[];
  structural: Structural[];
}
interface Prior {
  min: number;
  max: number | null;
}

// Raw JSON shapes (loose - the pack is authored by hand).
interface RawRule {
  text?: unknown;
  pattern?: unknown;
  weight?: unknown;
  where?: unknown;
  flags?: unknown;
  field?: unknown;
  signal?: unknown;
}
interface RawLabel {
  id?: unknown;
  emit?: unknown;
  phrases?: RawRule[];
  regexes?: RawRule[];
  filenames?: RawRule[];
  metadata?: RawRule[];
  negatives?: RawRule[];
  structural?: RawRule[];
}
interface RulesFile {
  labels?: RawLabel[];
  priors?: Record<string, unknown>;
}

let PREPARED: PreparedLabel[] | null = null;
let PRIORS: Map<string, Prior> | null = null;
let loadPromise: Promise<void> | null = null;

/** Load and prepare the rules pack once. Must resolve before classifyHeuristic. */
export async function ensureRulesLoaded(): Promise<void> {
  if (PREPARED && PRIORS) return;
  if (!loadPromise) {
    loadPromise = import("@app/services/heuristic/heuristicRules.json").then(
      (mod) => {
        const root = ((mod as { default?: RulesFile }).default ??
          (mod as RulesFile)) as RulesFile;
        PREPARED = prepare(root.labels ?? []);
        PRIORS = loadPriors(root.priors ?? {});
      },
      (err) => {
        // A failed chunk load (flaky network) must not poison later attempts.
        loadPromise = null;
        throw err;
      },
    );
  }
  await loadPromise;
}

// --- Preparation ---

function prepare(labels: RawLabel[]): PreparedLabel[] {
  const out: PreparedLabel[] = [];
  for (const label of labels) {
    const id = typeof label.id === "string" ? label.id : "";
    const emit = typeof label.emit !== "boolean" ? true : label.emit;

    const phrases: Phrase[] = [];
    for (const p of label.phrases ?? []) {
      const text = typeof p.text === "string" ? p.text : "";
      const w = num(p.weight);
      if (text.length === 0 || w <= 0) continue;
      phrases.push({
        text: normalize(text),
        weight: Math.min(w, 40),
        where: where(p),
      });
    }

    const regexes: Rx[] = [];
    for (const r of label.regexes ?? []) {
      const re = compileRegex(str(r.pattern), flags(r));
      if (re == null) continue;
      regexes.push({
        re,
        weight: Math.min(num(r.weight), 30),
        where: where(r),
      });
    }

    const filenames: FileRx[] = [];
    for (const r of label.filenames ?? []) {
      const re = compileRegex(str(r.pattern), flags(r));
      if (re == null) continue;
      filenames.push({ re, weight: Math.min(num(r.weight), 30) });
    }

    const metadata: MetaRx[] = [];
    for (const r of label.metadata ?? []) {
      const re = compileRegex(str(r.pattern), flags(r));
      if (re == null) continue;
      const field = typeof r.field === "string" && r.field ? r.field : "any";
      metadata.push({ field, re, weight: Math.min(num(r.weight), 20) });
    }

    const negatives: Negative[] = [];
    for (const n of label.negatives ?? []) {
      const text = n.text != null ? normalize(String(n.text)) : null;
      const re =
        n.pattern != null ? compileRegex(String(n.pattern), flags(n)) : null;
      if (text == null && re == null) continue;
      negatives.push({
        text,
        re,
        weight: Math.min(Math.abs(num(n.weight)), 30),
      });
    }

    const structural: Structural[] = [];
    for (const s of label.structural ?? []) {
      const signal = typeof s.signal === "string" ? s.signal : "";
      const w = num(s.weight);
      if (signal.length === 0 || w <= 0) continue;
      structural.push({ signal, weight: Math.min(w, 12) });
    }

    out.push({
      id,
      emit,
      phrases,
      regexes,
      filenames,
      metadata,
      negatives,
      structural,
    });
  }
  return out;
}

function loadPriors(priorsNode: Record<string, unknown>): Map<string, Prior> {
  const out = new Map<string, Prior>();
  for (const [key, val] of Object.entries(priorsNode)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const min = Math.trunc(num(val[0]));
    const max =
      val.length > 1 && val[1] != null ? Math.trunc(num(val[1])) : null;
    out.set(key, { min, max });
  }
  return out;
}

function where(node: RawRule): string {
  const w = typeof node.where === "string" ? node.where : "";
  return w.length === 0 ? "any" : w;
}

function flags(node: RawRule): string {
  return typeof node.flags === "string" ? node.flags : "";
}

/** Compile a rule regex to a RegExp, or null when it won't compile. */
export function compileRegex(
  pattern: string | null,
  flagStr: string,
): RegExp | null {
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

// --- Public API ---

interface ScoredLabel {
  label: PreparedLabel;
  score: number;
  distinct: number;
  /** Rule-hit descriptions, collected only when explain is requested. */
  signals: string[] | null;
}

/** Max candidates and per-candidate signals included in an explanation. */
const EXPLAIN_CANDIDATES = 6;
const EXPLAIN_SIGNALS = 12;

const fmt = (n: number) => Math.round(n * 10) / 10;

function toExplanation(
  en: { isEnglish: boolean; lowText: boolean },
  scored: ScoredLabel[],
): HeuristicExplanation {
  return {
    isEnglish: en.isEnglish,
    lowText: en.lowText,
    candidates: scored.slice(0, EXPLAIN_CANDIDATES).map((s) => ({
      id: s.label.id,
      emit: s.label.emit,
      score: fmt(s.score),
      distinct: s.distinct,
      signals: (s.signals ?? []).slice(0, EXPLAIN_SIGNALS),
    })),
  };
}

/** Classify a document; returns emitted label ids (primary + secondaries, capped at 5). */
export function classifyHeuristic(
  doc: HeuristicDoc,
  opts?: { explain?: boolean },
): HeuristicResult {
  if (!PREPARED || !PRIORS) {
    throw new Error(
      "Heuristic rules not loaded; await ensureRulesLoaded() before classifyHeuristic().",
    );
  }
  const explain = opts?.explain === true;

  const en = detectEnglish(doc.allZone);
  // Non-English with real text: honestly out of scope for the English heuristics.
  if (!en.isEnglish && !en.lowText) {
    return {
      labels: [],
      confidence: "none",
      score: 0,
      isEnglish: false,
      ...(explain ? { explain: toExplanation(en, []) } : {}),
    };
  }

  const titleRaw = nz(doc.titleZone);
  const firstRaw = nz(doc.firstZone);
  const anyRaw = nz(doc.allZone);
  const titleNorm = normalize(titleRaw);
  const firstNorm = normalize(firstRaw);
  const anyNorm = normalize(anyRaw);
  const fileNameLower = nz(doc.fileName).toLowerCase();
  const meta = doc.meta ?? {};
  const metaAll = Object.values(meta).join(" \n ");
  const struct = computeStructural(doc);

  const scored: ScoredLabel[] = [];
  for (const label of PREPARED) {
    let score = 0;
    let distinct = 0;
    const sig: string[] | null = explain ? [] : null;

    for (const phrase of label.phrases) {
      let best = 0;
      let bestZone = "";
      for (const zone of ["title", "first", "any"] as const) {
        const hay =
          zone === "title" ? titleNorm : zone === "first" ? firstNorm : anyNorm;
        const count = countOccurrences(hay, phrase.text);
        if (count === 0) continue;
        const zf = phrase.where === "any" || phrase.where === zone ? 1 : 0.75;
        const value = phrase.weight * ZONE_MULT[zone] * zf * damp(count);
        if (value > best) {
          best = value;
          bestZone = zone;
        }
      }
      if (best > 0) {
        score += best;
        distinct++;
        sig?.push(`phrase "${phrase.text}" +${fmt(best)} (${bestZone})`);
      }
    }

    for (const rx of label.regexes) {
      let best = 0;
      let bestZone = "";
      for (const zone of ["title", "first", "any"] as const) {
        const hay =
          zone === "title" ? titleRaw : zone === "first" ? firstRaw : anyRaw;
        const count = countRegex(rx.re, hay);
        if (count === 0) continue;
        const zf = rx.where === "any" || rx.where === zone ? 1 : 0.75;
        const value = rx.weight * ZONE_MULT[zone] * zf * damp(count);
        if (value > best) {
          best = value;
          bestZone = zone;
        }
      }
      if (best > 0) {
        score += best;
        distinct++;
        sig?.push(`regex ${rx.re.source} +${fmt(best)} (${bestZone})`);
      }
    }

    for (const fn of label.filenames) {
      if (countRegex(fn.re, fileNameLower) > 0) {
        score += fn.weight;
        distinct++;
        sig?.push(`filename ${fn.re.source} +${fn.weight}`);
      }
    }

    for (const md of label.metadata) {
      const value = md.field === "any" ? metaAll : (meta[md.field] ?? "");
      if (countRegex(md.re, value) > 0) {
        score += md.weight;
        distinct++;
        sig?.push(`metadata(${md.field}) ${md.re.source} +${md.weight}`);
      }
    }

    for (const st of label.structural) {
      const value = struct[st.signal] ?? 0;
      if (value > 0) {
        score += st.weight * value;
        sig?.push(`structural ${st.signal} +${fmt(st.weight * value)}`);
      }
    }

    for (const neg of label.negatives) {
      const count =
        neg.text != null
          ? countOccurrences(anyNorm, neg.text)
          : countRegex(neg.re, anyRaw);
      if (count > 0) {
        const value = neg.weight * damp(Math.min(count, 3));
        score -= value;
        sig?.push(
          `negative ${neg.text != null ? `"${neg.text}"` : (neg.re?.source ?? "")} -${fmt(value)}`,
        );
      }
    }

    if (score > 0) {
      const prior = pagePriorMultiplier(label.id, doc.pageCount);
      if (prior !== 1) sig?.push(`page-prior x${fmt(prior)}`);
      score *= prior;
      scored.push({ label, score, distinct, signals: sig });
    }
  }

  // Stable sort by score descending.
  scored.sort((a, b) => b.score - a.score);

  const top = scored.length === 0 ? null : scored[0];
  const s1 = top != null ? top.score : 0;
  const s2 = scored.length > 1 ? scored[1].score : 0;
  const margin = s1 - s2;

  let confidence: HeuristicConfidence = "none";
  if (top != null && s1 >= FLOOR) {
    if (
      s1 >= HIGH_SCORE &&
      margin >= HIGH_MARGIN &&
      top.distinct >= HIGH_SIGNALS &&
      s2 <= s1 * 0.65
    ) {
      confidence = "high";
    } else if (s1 >= MED_SCORE && margin >= MED_MARGIN) {
      confidence = "medium";
    } else {
      confidence = "low";
    }
  }

  const roundedScore = Math.round(s1);
  const explanation = explain ? { explain: toExplanation(en, scored) } : {};
  if (top == null || confidence === "none") {
    return {
      labels: [],
      confidence: "none",
      score: roundedScore,
      isEnglish: en.isEnglish,
      ...explanation,
    };
  }
  // Internal-only winner (book, menu...): suppress output rather than mislabel.
  if (!top.label.emit) {
    return {
      labels: [],
      confidence,
      score: roundedScore,
      isEnglish: en.isEnglish,
      ...explanation,
    };
  }

  const labels: string[] = [top.label.id];
  for (let i = 1; i < scored.length && labels.length < 5; i++) {
    const s = scored[i];
    if (labels.length - 1 >= SEC_MAX) break;
    if (
      s.label.emit &&
      s.score >= SEC_FLOOR &&
      s.score >= s1 * SEC_FRAC &&
      s.distinct >= SEC_SIGNALS
    ) {
      labels.push(s.label.id);
    }
  }
  return {
    labels,
    confidence,
    score: roundedScore,
    isEnglish: en.isEnglish,
    ...explanation,
  };
}

/** True when the top match cleared the high-confidence bar. */
export function isHighConfidence(r: HeuristicResult): boolean {
  return r.confidence === "high";
}

/** High confidence AND an emitted label - trustworthy enough to skip the AI engine. */
export function isDefinitive(r: HeuristicResult): boolean {
  return isHighConfidence(r) && r.labels.length > 0;
}

// --- English detection ---

interface EnglishResult {
  isEnglish: boolean;
  lowText: boolean;
}

export function detectEnglish(text: string): EnglishResult {
  const raw = nz(text);
  const letters = countAll(LETTERS, raw);
  if (letters < 25) return { isEnglish: false, lowText: true };

  for (const re of SCRIPT_RANGES) {
    const hits = countAll(re, raw);
    if (hits / letters > 0.25) return { isEnglish: false, lowText: false };
  }

  const latinRatio = countAll(LATIN_LETTER, raw) / letters;
  const words = allMatches(WORD, normalize(raw));
  const totalWords = Math.max(words.length, 1);
  let enHits = 0;
  for (const w of words) if (STOPWORDS.has(w)) enHits++;
  const stopRatio = enHits / totalWords;

  let bestScore = 0;
  let bestRatio = 0;
  let bestDistinct = 0;
  let bestDia = 0;
  for (const profile of LATIN_PROFILES) {
    let hits = 0;
    const distinct = new Set<string>();
    for (const w of words) {
      if (profile.words.has(w)) {
        hits++;
        distinct.add(w);
      }
    }
    const diaCount = profile.dia == null ? 0 : countAll(profile.dia, raw);
    const ratio = hits / totalWords;
    const score = ratio + Math.min(diaCount / totalWords, 0.15) * 6;
    if (score > bestScore) {
      bestScore = score;
      bestRatio = ratio;
      bestDistinct = distinct.size;
      bestDia = diaCount;
    }
  }

  const lowText = totalWords < 30;
  const nonEnglish =
    latinRatio >= 0.7 &&
    totalWords >= 12 &&
    (bestDistinct >= 3 || bestDia >= 6) &&
    (bestDia >= 3 || bestRatio >= 0.1) &&
    bestScore > stopRatio * 1.2 &&
    (stopRatio < 0.04 || bestRatio > stopRatio * 1.5);
  if (nonEnglish) return { isEnglish: false, lowText };

  const bar = lowText ? 0.03 : 0.045;
  // Data-dense docs (tickets, itineraries, prescriptions) are mostly names and numbers with few
  // function words in ANY language; reject stop-poor text only on affirmative foreign evidence.
  const foreignEvidence = bestDistinct >= 3 || bestDia >= 6;
  return {
    isEnglish: latinRatio >= 0.75 && (stopRatio >= bar || !foreignEvidence),
    lowText,
  };
}

// --- Structural signals ---

function computeStructural(doc: HeuristicDoc): Record<string, number> {
  const all = nz(doc.allZone);
  const lines: string[] = [];
  for (const l of all.split("\n")) {
    const t = l.trim();
    if (t.length > 0) lines.push(t);
  }
  const tokens: string[] = [];
  for (const t of all.split(WHITESPACE)) {
    if (t.length > 0) tokens.push(t);
  }
  const totalTokens = Math.max(tokens.length, 1);

  const currency = countAll(CURRENCY, all);
  let numericTokens = 0;
  for (const t of tokens) {
    if (NUMERIC_TOKEN.test(t) && DIGIT.test(t)) numericTokens++;
  }
  let formLines = 0;
  for (const l of lines) {
    if (FORM_LABEL.test(l) || UNDERSCORE4.test(l) || CHECKBOX.test(l))
      formLines++;
  }
  let dotLeaders = 0;
  for (const l of lines) if (DOT_LEADER.test(l)) dotLeaders++;
  let bullets = 0;
  for (const l of lines) if (BULLET.test(l)) bullets++;
  const urls = countAll(URL, all);
  const tail = all.length > 2500 ? all.slice(all.length - 2500) : all;
  const last4000 = all.length > 4000 ? all.slice(all.length - 4000) : all;

  const s: Record<string, number> = {};
  s["currency_heavy"] = currency >= 8 ? 1.0 : Math.min(currency / 8.0, 1.0);
  s["number_table"] = numericTokens / totalTokens >= 0.22 ? 1.0 : 0.0;
  s["form_like"] = formLines >= 6 ? 1.0 : formLines >= 3 ? 0.5 : 0.0;
  s["toc"] = TOC.test(all) || dotLeaders >= 5 ? 1.0 : 0.0;
  s["signature_block"] = SIG1.test(tail) || SIG2.test(tail) ? 1.0 : 0.0;
  s["references_section"] =
    REF1.test(last4000) && REF2.test(last4000) ? 1.0 : 0.0;
  s["short_doc"] = doc.pageCount > 0 && doc.pageCount <= 2 ? 1.0 : 0.0;
  s["long_doc"] = doc.pageCount >= 40 ? 1.0 : 0.0;
  s["bullet_heavy"] = bullets >= 12 ? 1.0 : bullets >= 6 ? 0.5 : 0.0;
  s["email_headers"] = EMAIL_FROM.test(all) && EMAIL_SUBJ.test(all) ? 1.0 : 0.0;
  s["url_heavy"] = urls >= 6 ? 1.0 : 0.0;
  s["address_block"] = countAll(ADDRESS, all) >= 2 ? 1.0 : 0.0;
  return s;
}

function pagePriorMultiplier(labelId: string, pageCount: number): number {
  const prior = PRIORS!.get(labelId);
  if (prior == null || pageCount < 1) return 1;
  if (prior.max != null && pageCount > prior.max) {
    return Math.max(0.3, prior.max / pageCount);
  }
  if (pageCount < prior.min) return Math.max(0.3, pageCount / prior.min);
  return 1;
}

// --- Helpers ---

function nz(s: string | null | undefined): string {
  return s == null ? "" : s;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// Curly apostrophes and fi/fl ligatures survive pdf.js extraction in many PDFs;
// fold them to ASCII so rule phrases authored with ' / fi / fl still match.
const CURLY_APOSTROPHE = /[\u2018\u2019]/g;
const LIGATURE_FI = /\uFB01/g;
const LIGATURE_FL = /\uFB02/g;

function normalize(text: string | null | undefined): string {
  return nz(text)
    .toLowerCase()
    .replace(CURLY_APOSTROPHE, "'")
    .replace(LIGATURE_FI, "fi")
    .replace(LIGATURE_FL, "fl")
    .replace(WHITESPACE, " ");
}

function damp(count: number): number {
  if (count <= 0) return 0;
  return 1 + 0.35 * (Math.log(Math.min(count, 12)) / Math.log(2));
}

function countOccurrences(haystack: string, needle: string | null): number {
  if (needle == null || needle.length === 0) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1 && count < 12) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// Non-overlapping matches capped at 12.
function countRegex(re: RegExp | null, text: string | null): number {
  if (re == null || text == null || text.length === 0) return 0;
  re.lastIndex = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while (count < 12 && (m = re.exec(text)) !== null) {
    count++;
    if (m.index === re.lastIndex) re.lastIndex++; // advance past zero-width match
  }
  return count;
}

function countAll(re: RegExp, text: string | null): number {
  if (text == null || text.length === 0) return 0;
  re.lastIndex = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    count++;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return count;
}

function allMatches(re: RegExp, text: string | null): string[] {
  const out: string[] = [];
  if (text == null || text.length === 0) return out;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0]);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}
