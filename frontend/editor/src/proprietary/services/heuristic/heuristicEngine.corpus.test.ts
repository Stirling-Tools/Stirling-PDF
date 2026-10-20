// Broad-corpus accuracy gate: one realistic, natural-prose specimen per document
// type, asserted on the real engine + rules pack.

import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyHeuristic,
  ensureRulesLoaded,
} from "@app/services/heuristic/heuristicEngine";
import type { HeuristicDoc } from "@app/services/heuristic/types";
// Shared with the Rust classifier's corpus test (tools-core/proprietary/classify).
import CORPUS from "@app/services/heuristic/fixtures/corpus.json";

beforeAll(async () => {
  await ensureRulesLoaded();
});

interface Case {
  /** What the case (and those after it) exercises. */
  note?: string;
  /** Expected top label; "" asserts the document stays unlabelled. */
  expect: string;
  file: string;
  pages?: number;
  /** Replace every space with U+00A0, as some pdf.js text layers do. */
  nbsp?: boolean;
  /** Info-dict metadata (lowercase keys), e.g. a generator's producer string. */
  meta?: Record<string, string>;
  title: string;
  body: string[];
}

const run = async (c: Case) => {
  let body = c.body.join("\n");
  let title = c.title;
  if (c.nbsp) {
    body = body.replace(/ /g, "\u00A0");
    title = title.replace(/ /g, "\u00A0");
  }
  const doc: HeuristicDoc = {
    fileName: c.file,
    pageCount: c.pages ?? 1,
    meta: c.meta ?? {},
    titleZone: title,
    firstZone: body,
    allZone: body,
  };
  return classifyHeuristic(doc);
};

const CASES: Case[] = CORPUS;

describe("heuristic engine broad corpus", () => {
  it.each(CASES.map((c) => [c.expect || `nothing (${c.file})`, c] as const))(
    "labels a %s correctly",
    async (_label, c) => {
      const r = await run(c);
      const detail = `expected ${c.expect || "no label"}, got [${r.labels.join(", ")}] (confidence ${r.confidence}, score ${r.score})`;
      if (c.expect === "") {
        expect(r.labels, detail).toEqual([]);
      } else {
        expect(r.labels[0], detail).toBe(c.expect);
      }
    },
  );
});
