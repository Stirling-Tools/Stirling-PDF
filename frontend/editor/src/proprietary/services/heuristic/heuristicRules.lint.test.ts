// Structural lint for the rules pack: the engine silently drops or clamps
// malformed rules, so authoring mistakes must fail here instead.

import { describe, expect, it } from "vitest";
import { compileRegex } from "@app/services/heuristic/heuristicEngine";
import rules from "@app/services/heuristic/heuristicRules.json";

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
const labels = (rules as { labels: RawLabel[] }).labels;
const priors = (rules as { priors: Record<string, unknown> }).priors;

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

describe("heuristicRules.json pack lint", () => {
  it("has unique, non-empty label ids", () => {
    const ids = labels.map((l) => l.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(
      true,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keys every page prior to an existing label id", () => {
    const ids = new Set(labels.map((l) => l.id));
    const orphans = Object.keys(priors).filter((k) => !ids.has(k));
    expect(orphans, "priors keyed to no label never apply").toEqual([]);
  });

  it("compiles every regex/filename/metadata/negative pattern", () => {
    const broken: string[] = [];
    for (const label of labels) {
      for (const kind of ["regexes", "filenames", "metadata"] as const) {
        for (const r of label[kind] ?? []) {
          if (compileRegex(r.pattern ?? null, r.flags ?? "") == null) {
            broken.push(`${label.id} ${kind}: ${r.pattern}`);
          }
        }
      }
      for (const n of label.negatives ?? []) {
        if (
          n.pattern != null &&
          compileRegex(n.pattern, n.flags ?? "") == null
        ) {
          broken.push(`${label.id} negative: ${n.pattern}`);
        }
      }
    }
    expect(broken, "non-compiling patterns are silently dropped").toEqual([]);
  });

  it("uses only structural signals the engine computes", () => {
    const unknown: string[] = [];
    for (const label of labels) {
      for (const s of label.structural ?? []) {
        if (!SIGNALS.has(s.signal ?? "")) {
          unknown.push(`${label.id}: ${s.signal}`);
        }
      }
    }
    expect(unknown, "unknown signals always score 0").toEqual([]);
  });

  it("uses only zones and metadata fields the engine reads", () => {
    const bad: string[] = [];
    for (const label of labels) {
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
    expect(bad).toEqual([]);
  });

  it("keeps every weight positive and within the engine's clamp", () => {
    const bad: string[] = [];
    for (const label of labels) {
      for (const kind of [
        "phrases",
        "regexes",
        "filenames",
        "metadata",
        "negatives",
        "structural",
      ] as const) {
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
    expect(bad).toEqual([]);
  });

  it("gives every phrase a non-empty text and every negative a matcher", () => {
    const bad: string[] = [];
    for (const label of labels) {
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
});
