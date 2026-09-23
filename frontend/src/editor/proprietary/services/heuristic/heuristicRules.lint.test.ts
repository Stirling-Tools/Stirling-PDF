// Structural lint for the rule files: the engine silently drops or clamps
// malformed rules, so authoring mistakes must fail here instead.

import { beforeAll, describe, expect, it } from "vitest";
import { compileRegex } from "@app/services/heuristic/heuristicEngine";
import {
  LANGUAGE_PACKS,
  PACK_LANGUAGES,
  loadCoreRules,
} from "@app/services/heuristic/rules/index";
import languages from "@app/services/heuristic/rules/languages.json";

interface RawRule {
  text?: string;
  pattern?: string;
  weight?: number;
  where?: string;
  flags?: string;
  field?: string;
  signal?: string;
}
interface RawLabel {
  id: string;
  emit?: boolean;
  phrases?: RawRule[];
  regexes?: RawRule[];
  filenames?: RawRule[];
  metadata?: RawRule[];
  negatives?: RawRule[];
  structural?: RawRule[];
}
interface RuleFile {
  version?: number;
  language?: string;
  labels?: RawLabel[];
  priors?: Record<string, unknown>;
  patterns?: Record<string, RawRule[]>;
}

// Mirrors computeStructural's emitted keys; extend together with the engine.
const SIGNALS = new Set([
  "currency_heavy",
  "number_table",
  "form_like",
  "toc",
  "signature_block",
  "references_section",
  "short_doc",
  "long_doc",
  "bullet_heavy",
  "email_headers",
  "url_heavy",
  "address_block",
]);
const PATTERN_GROUPS = new Set([
  "currency",
  "form_label",
  "address",
  "toc",
  "signature",
  "signature_form",
  "references",
  "email_from",
  "email_subject",
]);
const ZONES = new Set(["title", "first", "any"]);
const META_FIELDS = new Set([
  "title",
  "author",
  "subject",
  "keywords",
  "creator",
  "producer",
  "any",
]);
// The engine clamps at these; authoring past them is a hidden no-op, so fail instead.
const WEIGHT_CAPS = {
  phrases: 40,
  regexes: 30,
  filenames: 30,
  metadata: 20,
  negatives: 30,
  structural: 12,
} as const;

const RULE_KINDS = Object.keys(WEIGHT_CAPS) as (keyof typeof WEIGHT_CAPS)[];

let core: RuleFile;
const packs = new Map<string, RuleFile>();

beforeAll(async () => {
  core = (await loadCoreRules()) as RuleFile;
  for (const [language, load] of Object.entries(LANGUAGE_PACKS)) {
    const mod = (await load()) as { default?: RuleFile };
    packs.set(language, mod.default ?? (mod as RuleFile));
  }
});

function labelsOf(file: RuleFile): RawLabel[] {
  return file.labels ?? [];
}

function brokenPatterns(file: RuleFile): string[] {
  const broken: string[] = [];
  for (const label of labelsOf(file)) {
    for (const kind of ["regexes", "filenames", "metadata"] as const) {
      for (const r of label[kind] ?? []) {
        if (compileRegex(r.pattern ?? null, r.flags ?? "") == null) {
          broken.push(`${label.id} ${kind}: ${r.pattern}`);
        }
      }
    }
    for (const n of label.negatives ?? []) {
      if (n.pattern != null && compileRegex(n.pattern, n.flags ?? "") == null) {
        broken.push(`${label.id} negative: ${n.pattern}`);
      }
    }
  }
  for (const [group, rules] of Object.entries(file.patterns ?? {})) {
    for (const r of rules) {
      if (compileRegex(r.pattern ?? null, r.flags ?? "") == null) {
        broken.push(`patterns.${group}: ${r.pattern}`);
      }
    }
  }
  return broken;
}

function badWeights(file: RuleFile): string[] {
  const bad: string[] = [];
  for (const label of labelsOf(file)) {
    for (const kind of RULE_KINDS) {
      for (const r of label[kind] ?? []) {
        const w = r.weight;
        if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
          bad.push(`${label.id} ${kind}: weight ${String(w)}`);
        } else if (Math.abs(w) > WEIGHT_CAPS[kind]) {
          bad.push(`${label.id} ${kind}: weight ${w} over cap`);
        }
      }
    }
  }
  return bad;
}

function badZonesAndFields(file: RuleFile): string[] {
  const bad: string[] = [];
  for (const label of labelsOf(file)) {
    for (const kind of ["phrases", "regexes"] as const) {
      for (const r of label[kind] ?? []) {
        if (r.where != null && !ZONES.has(r.where)) {
          bad.push(`${label.id} ${kind} where: ${r.where}`);
        }
      }
    }
    for (const m of label.metadata ?? []) {
      if (m.field != null && !META_FIELDS.has(m.field)) {
        bad.push(`${label.id} metadata field: ${m.field}`);
      }
    }
  }
  return bad;
}

function unknownPatternGroups(file: RuleFile): string[] {
  return Object.keys(file.patterns ?? {}).filter((g) => !PATTERN_GROUPS.has(g));
}

describe("core rule set", () => {
  it("has unique, non-empty label ids", () => {
    const ids = labelsOf(core).map((l) => l.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
      true,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keys every page prior to an existing label id", () => {
    const ids = new Set(labelsOf(core).map((l) => l.id));
    const orphans = Object.keys(core.priors ?? {}).filter((k) => !ids.has(k));
    expect(orphans, "priors keyed to no label never apply").toEqual([]);
  });

  it("compiles every pattern", () => {
    expect(brokenPatterns(core), "non-compiling patterns are dropped").toEqual(
      [],
    );
  });

  it("uses only structural signals the engine computes", () => {
    const unknown: string[] = [];
    for (const label of labelsOf(core)) {
      for (const s of label.structural ?? []) {
        if (!SIGNALS.has(s.signal ?? ""))
          unknown.push(`${label.id}: ${s.signal}`);
      }
    }
    expect(unknown, "unknown signals always score 0").toEqual([]);
  });

  it("uses only zones, metadata fields and pattern groups the engine reads", () => {
    expect(badZonesAndFields(core)).toEqual([]);
    expect(unknownPatternGroups(core)).toEqual([]);
  });

  it("keeps every weight positive and within the engine's clamp", () => {
    expect(badWeights(core)).toEqual([]);
  });

  it("holds no language vocabulary", () => {
    const leaked: string[] = [];
    for (const label of labelsOf(core)) {
      if ((label.phrases ?? []).length > 0) leaked.push(`${label.id}: phrases`);
      if ((label.negatives ?? []).length > 0) {
        leaked.push(`${label.id}: negatives`);
      }
      for (const m of label.metadata ?? []) {
        if (m.field === "title") leaked.push(`${label.id}: metadata title`);
      }
    }
    expect(
      leaked,
      "phrases, negatives and document-title words are per-language; core is what every language shares",
    ).toEqual([]);
  });
});

describe.each(PACK_LANGUAGES)("language pack: %s", (language) => {
  const pack = () => packs.get(language)!;

  it("declares the language it is registered under", () => {
    expect(pack().language).toBe(language);
  });

  it("has unique label ids, all declared by core", () => {
    const coreIds = new Set(labelsOf(core).map((l) => l.id));
    const ids = labelsOf(pack()).map((l) => l.id);
    expect(new Set(ids).size, "a duplicated id silently merges").toBe(
      ids.length,
    );
    expect(
      ids.filter((id) => !coreIds.has(id)),
      "a label id core does not declare scores to something the UI cannot render",
    ).toEqual([]);
  });

  it("compiles every pattern", () => {
    expect(brokenPatterns(pack())).toEqual([]);
  });

  it("uses only zones, metadata fields and pattern groups the engine reads", () => {
    expect(badZonesAndFields(pack())).toEqual([]);
    expect(unknownPatternGroups(pack())).toEqual([]);
  });

  it("keeps every weight positive and within the engine's clamp", () => {
    expect(badWeights(pack())).toEqual([]);
  });

  it("leaves structural weights and page priors to core", () => {
    const leaked: string[] = [];
    for (const label of labelsOf(pack())) {
      if ((label.structural ?? []).length > 0) {
        leaked.push(`${label.id}: structural`);
      }
    }
    expect(
      leaked,
      "document shape is language-neutral, so its weights belong in core",
    ).toEqual([]);
    expect(
      pack().priors,
      "priors are core's; a pack copy would be ignored",
    ).toBe(undefined);
  });

  it("gives every phrase a non-empty text and every negative a matcher", () => {
    const bad: string[] = [];
    for (const label of labelsOf(pack())) {
      for (const p of label.phrases ?? []) {
        if (typeof p.text !== "string" || p.text.trim().length === 0) {
          bad.push(`${label.id} phrase with empty text`);
        }
      }
      for (const n of label.negatives ?? []) {
        if (n.text == null && n.pattern == null) {
          bad.push(`${label.id} negative with neither text nor pattern`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("normalises phrase text to lower case", () => {
    const upper: string[] = [];
    for (const label of labelsOf(pack())) {
      for (const p of label.phrases ?? []) {
        const text = p.text ?? "";
        if (text !== text.toLowerCase()) upper.push(`${label.id}: ${text}`);
      }
    }
    expect(
      upper,
      "the engine lower-cases the document before matching, so a capital never matches",
    ).toEqual([]);
  });
});

interface LanguagesFile {
  english: { words: string[] };
  scripts: { id: string; range: string; languages: string[] }[];
  latin: { languages: string[] };
  profiles: { language: string; words: string[]; chars: string | null }[];
}

describe("language profiles", () => {
  const data = languages as LanguagesFile;
  const profileFor = new Map(data.profiles.map((p) => [p.language, p]));

  it("compiles every script range and distinctive-letter class", () => {
    const broken: string[] = [];
    for (const s of data.scripts) {
      if (compileRegex(s.range, "g") == null) broken.push(`${s.id} range`);
    }
    for (const p of data.profiles) {
      if (p.chars != null && compileRegex(p.chars, "g") == null) {
        broken.push(`${p.language} chars`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("gives every profile lower-case words", () => {
    const bad: string[] = [];
    for (const p of data.profiles) {
      if (p.words.length === 0) bad.push(`${p.language} has no words`);
      const upper = p.words.filter((w) => w !== w.toLowerCase());
      if (upper.length > 0) bad.push(`${p.language}: ${upper.join(" ")}`);
    }
    expect(bad, "the engine lower-cases before matching").toEqual([]);
  });

  it("tags every language with a region-free ISO 639-1 code", () => {
    const tags = [
      ...data.latin.languages,
      ...data.scripts.flatMap((s) => s.languages),
      ...data.profiles.map((p) => p.language),
    ];
    expect(tags.filter((t) => !/^[a-z]{2}$/.test(t))).toEqual([]);
  });

  it("declares each language in exactly one group", () => {
    const all = [
      ...data.latin.languages,
      ...data.scripts.flatMap((s) => s.languages),
    ];
    const dupes = all.filter((t, i) => all.indexOf(t) !== i);
    expect(
      dupes,
      "a language in two groups is scored by whichever range wins",
    ).toEqual([]);
  });

  it("gives a profile to every language that has to be told apart from a sibling", () => {
    const needs = [
      ...data.latin.languages,
      ...data.scripts
        .filter((s) => s.languages.length > 1)
        .flatMap((s) => s.languages),
    ];
    expect(
      needs.filter((l) => !profileFor.has(l)),
      "a language sharing its group with another can only be reached by profile",
    ).toEqual([]);
  });

  it("has no profile for a language nothing can dispatch to", () => {
    const reachable = new Set([
      ...data.latin.languages,
      ...data.scripts.flatMap((s) => s.languages),
    ]);
    expect(
      data.profiles.map((p) => p.language).filter((l) => !reachable.has(l)),
    ).toEqual([]);
  });

  it("can dispatch to every registered pack", () => {
    const detectable = new Set<string>(["en"]);
    for (const l of data.latin.languages) detectable.add(l);
    for (const s of data.scripts)
      for (const l of s.languages) detectable.add(l);
    expect(
      PACK_LANGUAGES.filter((l) => !detectable.has(l)),
      "a pack the detector can never name is dead weight in the bundle",
    ).toEqual([]);
  });
});
