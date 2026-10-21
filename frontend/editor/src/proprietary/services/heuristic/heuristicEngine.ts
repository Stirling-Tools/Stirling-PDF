// Heuristic (non-AI) document classifier: string/regex/structural scoring over
// extracted text, filename and metadata. Rules lazy-load per detected language.

import {
  LANGUAGE_PACKS,
  loadCoreRules,
} from "@app/services/heuristic/rules/index";
import { detectLanguage } from "@app/services/languageDetection/detectLanguage";
import type {
  HeuristicConfidence,
  HeuristicDoc,
  HeuristicExplanation,
  HeuristicResult,
  LanguageDetection,
} from "@app/services/heuristic/types";

export { detectLanguage };

export type {
  HeuristicConfidence,
  HeuristicDoc,
  HeuristicExplanation,
  HeuristicResult,
  LanguageDetection,
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

const SECOND_PACK_BAR = 0.75;
const MAX_PACKS_CONFIDENT = 2;
const MAX_PACKS_UNSURE = 5;
const UNSURE_MAX_CHARS = 20000;
const NO_PACK_CONFIDENCE_CAP: HeuristicConfidence = "medium";

// Language-neutral structural patterns. Anything with a word in it lives in
// `rules/`; these are digits, punctuation and glyph shapes.
const NUMERIC_TOKEN = new RegExp("^[\\d$£€.,%-]+$");
const DIGIT = /\d/;
const UNDERSCORE4 = /_{4,}/;
const CHECKBOX = /[☐☑□■]\s/;
const DOT_LEADER = /\.{5,}\s*\d+\s*$/;
const BULLET = /^[•▪◦*-]\s+\S/;
const URL = /https?:\/\/|www\./gi;
const CITATION = /\[\d{1,3}\]|\(\d{4}\)/;

// ASCII whitespace plus the no-break spaces pdf.js extraction commonly emits.
// oxlint-disable-next-line no-control-regex -- vertical tab is intentional ASCII whitespace
const WHITESPACE = /[\t\n\x0B\f\r    ]+/g;
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

type SignalPatterns = Map<string, RegExp[]>;

interface PreparedSet {
  labels: PreparedLabel[];
  priors: Map<string, Prior>;
  signals: SignalPatterns;
  packs: string[];
}

// Raw JSON shapes (the rule files are authored by hand).
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
interface RawRules {
  labels?: RawLabel[];
  priors?: Record<string, unknown>;
  patterns?: Record<string, RawRule[]>;
}

const RULE_KINDS = [
  "phrases",
  "regexes",
  "filenames",
  "metadata",
  "negatives",
  "structural",
] as const;

let CORE: RawRules | null = null;
let corePromise: Promise<RawRules> | null = null;
const PACKS = new Map<string, RawRules>();
const packPromises = new Map<string, Promise<RawRules>>();
const SETS = new Map<string, PreparedSet>();

function unwrap(mod: unknown): RawRules {
  const withDefault = mod as { default?: RawRules };
  return withDefault.default ?? (mod as RawRules);
}

function loadCore(): Promise<RawRules> {
  if (CORE != null) return Promise.resolve(CORE);
  if (corePromise == null) {
    corePromise = loadCoreRules().then(
      (mod) => {
        CORE = unwrap(mod);
        return CORE;
      },
      (err) => {
        // A failed chunk load (flaky network) must not poison later attempts.
        corePromise = null;
        throw err;
      },
    );
  }
  return corePromise;
}

function loadPack(language: string): Promise<RawRules | null> {
  const existing = PACKS.get(language);
  if (existing != null) return Promise.resolve(existing);
  const loader = LANGUAGE_PACKS[language];
  if (loader == null) return Promise.resolve(null);
  let pending = packPromises.get(language);
  if (pending == null) {
    pending = loader().then(
      (mod) => {
        const pack = unwrap(mod);
        PACKS.set(language, pack);
        return pack;
      },
      (err) => {
        packPromises.delete(language);
        throw err;
      },
    );
    packPromises.set(language, pending);
  }
  return pending;
}

export async function ensureRulesLoaded(
  langs: readonly string[] = ["en"],
): Promise<void> {
  await Promise.all([loadCore(), ...langs.map((l) => loadPack(l))]);
}

// --- merging and preparation ---

function mergeRaw(core: RawRules, packs: RawRules[]): RawRules {
  if (packs.length === 0) return core;

  const byId = new Map<string, RawLabel>();
  const order: string[] = [];
  for (const label of core.labels ?? []) {
    const id = str(label.id);
    if (id == null) continue;
    byId.set(id, { ...label });
    order.push(id);
  }

  for (const pack of packs) {
    for (const label of pack.labels ?? []) {
      const id = str(label.id);
      const target = id == null ? undefined : byId.get(id);
      if (target == null) continue;
      for (const kind of RULE_KINDS) {
        const extra = label[kind];
        if (extra == null || extra.length === 0) continue;
        target[kind] = [...(target[kind] ?? []), ...extra];
      }
    }
  }

  const patterns: Record<string, RawRule[]> = {};
  for (const source of [core, ...packs]) {
    for (const [group, rules] of Object.entries(source.patterns ?? {})) {
      patterns[group] = [...(patterns[group] ?? []), ...rules];
    }
  }

  return {
    labels: order.map((id) => byId.get(id)!),
    priors: core.priors,
    patterns,
  };
}

function buildSet(core: RawRules, langs: string[]): PreparedSet {
  const key = langs.join("+");
  const cached = SETS.get(key);
  if (cached != null) return cached;

  const packs = langs.flatMap((l) => {
    const pack = PACKS.get(l);
    return pack == null ? [] : [pack];
  });
  const merged = mergeRaw(core, packs);
  const set: PreparedSet = {
    labels: prepare(merged.labels ?? []),
    priors: loadPriors(merged.priors ?? {}),
    signals: prepareSignals(merged.patterns ?? {}),
    packs: langs,
  };
  SETS.set(key, set);
  return set;
}

function prepareSignals(groups: Record<string, RawRule[]>): SignalPatterns {
  const out: SignalPatterns = new Map();
  for (const [group, rules] of Object.entries(groups)) {
    const compiled: RegExp[] = [];
    for (const rule of rules) {
      const re = compileRegex(str(rule.pattern), flags(rule));
      if (re != null) compiled.push(re);
    }
    if (compiled.length > 0) out.set(group, compiled);
  }
  return out;
}

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

function packsFor(
  detection: LanguageDetection,
  chars: number,
  localeHint?: string,
): string[] {
  const ranked =
    detection.candidates.length > 0
      ? detection.candidates
      : detection.language != null
        ? [{ language: detection.language, score: 1 }]
        : [];
  const best = ranked[0]?.score ?? 0;
  const unsure =
    (detection.assumed || detection.lowText) && chars <= UNSURE_MAX_CHARS;
  const max = unsure ? MAX_PACKS_UNSURE : MAX_PACKS_CONFIDENT;
  const bar = detection.assumed ? 0 : best * SECOND_PACK_BAR;
  const out: string[] = [];
  if (detection.assumed && localeHint != null) {
    const hinted = localeHint.slice(0, 2).toLowerCase();
    if (hinted !== "en" && hinted in LANGUAGE_PACKS) out.push(hinted);
  }
  for (const candidate of ranked) {
    if (out.length >= max) break;
    if (candidate.score < bar) break;
    if (!(candidate.language in LANGUAGE_PACKS)) continue;
    if (!out.includes(candidate.language)) out.push(candidate.language);
  }
  return out;
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
  detection: LanguageDetection,
  packs: string[],
  scored: ScoredLabel[],
): HeuristicExplanation {
  return {
    language: detection.language,
    script: detection.script,
    assumed: detection.assumed,
    lowText: detection.lowText,
    packs,
    languageCandidates: detection.candidates.map((c) => ({
      language: c.language,
      score: fmt(c.score * 100) / 100,
    })),
    candidates: scored.slice(0, EXPLAIN_CANDIDATES).map((s) => ({
      id: s.label.id,
      emit: s.label.emit,
      score: fmt(s.score),
      distinct: s.distinct,
      signals: (s.signals ?? []).slice(0, EXPLAIN_SIGNALS),
    })),
  };
}

export async function classifyHeuristic(
  doc: HeuristicDoc,
  opts?: { explain?: boolean; localeHint?: string },
): Promise<HeuristicResult> {
  const detection = detectLanguage(doc.allZone);
  const wanted = packsFor(detection, nz(doc.allZone).length, opts?.localeHint);
  const core = await loadCore();
  await Promise.all(wanted.map((l) => loadPack(l)));
  const loaded = wanted.filter((l) => PACKS.has(l));
  return score(doc, buildSet(core, loaded), detection, opts);
}

function score(
  doc: HeuristicDoc,
  set: PreparedSet,
  detection: LanguageDetection,
  opts?: { explain?: boolean },
): HeuristicResult {
  const explain = opts?.explain === true;
  const titleRaw = nz(doc.titleZone);
  const firstRaw = nz(doc.firstZone);
  const anyRaw = nz(doc.allZone);
  const titleNorm = normalize(titleRaw);
  const firstNorm = normalize(firstRaw);
  const anyNorm = normalize(anyRaw);
  const fileNameLower = nz(doc.fileName).toLowerCase();
  const meta = doc.meta ?? {};
  const metaAll = Object.values(meta).join(" \n ");
  const struct = computeStructural(doc, set.signals);

  const scored: ScoredLabel[] = [];
  for (const label of set.labels) {
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
      const prior = pagePriorMultiplier(set.priors, label.id, doc.pageCount);
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
  if (set.packs.length === 0 && confidence === "high") {
    confidence = NO_PACK_CONFIDENCE_CAP;
  }

  const roundedScore = Math.round(s1);
  const explanation = explain
    ? { explain: toExplanation(detection, set.packs, scored) }
    : {};
  const base = {
    confidence,
    score: roundedScore,
    language: detection.language,
    packs: set.packs,
    ...explanation,
  };
  if (top == null || confidence === "none") {
    return { ...base, labels: [], confidence: "none" };
  }
  // Internal-only winner (book, menu...): suppress output rather than mislabel.
  if (!top.label.emit) return { ...base, labels: [] };

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
  return { ...base, labels };
}

/** True when the top match cleared the high-confidence bar. */
export function isHighConfidence(r: HeuristicResult): boolean {
  return r.confidence === "high";
}

/** High confidence AND an emitted label - trustworthy enough to skip the AI engine. */
export function isDefinitive(r: HeuristicResult): boolean {
  return isHighConfidence(r) && r.labels.length > 0;
}

// --- Structural signals ---

function anyMatch(
  signals: SignalPatterns,
  group: string,
  hay: string,
): boolean {
  const patterns = signals.get(group);
  if (patterns == null) return false;
  for (const re of patterns) if (countRegex(re, hay) > 0) return true;
  return false;
}

function countGroup(
  signals: SignalPatterns,
  group: string,
  hay: string,
): number {
  const patterns = signals.get(group);
  if (patterns == null) return 0;
  let total = 0;
  for (const re of patterns) total += countAll(re, hay);
  return total;
}

function computeStructural(
  doc: HeuristicDoc,
  signals: SignalPatterns,
): Record<string, number> {
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

  const currency = countGroup(signals, "currency", all);
  let numericTokens = 0;
  for (const t of tokens) {
    if (NUMERIC_TOKEN.test(t) && DIGIT.test(t)) numericTokens++;
  }
  const formLabels = signals.get("form_label") ?? [];
  let formLines = 0;
  for (const l of lines) {
    if (
      UNDERSCORE4.test(l) ||
      CHECKBOX.test(l) ||
      formLabels.some((re) => countRegex(re, l) > 0)
    ) {
      formLines++;
    }
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
  s["toc"] = anyMatch(signals, "toc", all) || dotLeaders >= 5 ? 1.0 : 0.0;
  s["signature_block"] =
    anyMatch(signals, "signature", tail) ||
    anyMatch(signals, "signature_form", tail)
      ? 1.0
      : 0.0;
  s["references_section"] =
    anyMatch(signals, "references", last4000) && CITATION.test(last4000)
      ? 1.0
      : 0.0;
  s["short_doc"] = doc.pageCount > 0 && doc.pageCount <= 2 ? 1.0 : 0.0;
  s["long_doc"] = doc.pageCount >= 40 ? 1.0 : 0.0;
  s["bullet_heavy"] = bullets >= 12 ? 1.0 : bullets >= 6 ? 0.5 : 0.0;
  s["email_headers"] =
    anyMatch(signals, "email_from", all) &&
    anyMatch(signals, "email_subject", all)
      ? 1.0
      : 0.0;
  s["url_heavy"] = urls >= 6 ? 1.0 : 0.0;
  s["address_block"] = countGroup(signals, "address", all) >= 2 ? 1.0 : 0.0;
  return s;
}

function pagePriorMultiplier(
  priors: Map<string, Prior>,
  labelId: string,
  pageCount: number,
): number {
  const prior = priors.get(labelId);
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
  return typeof v === "string" && v.length > 0 ? v : null;
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

function damp(count: number): number {
  if (count <= 0) return 0;
  return 1 + 0.35 * (Math.log(Math.min(count, 12)) / Math.log(2));
}

function countOccurrences(haystack: string, needle: string | null): number {
  if (needle == null || needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    count++;
    from = at + needle.length;
  }
  return count;
}

function countRegex(re: RegExp | null, text: string | null): number {
  if (re == null || text == null || text.length === 0) return 0;
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
