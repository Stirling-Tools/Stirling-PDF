// Accuracy gate for language detection, measured on real corpora rather than on
// sentences we wrote ourselves. Skipped unless the corpus is present, so CI and a
// normal `vitest run` ignore it:
//
//   rules/tools/fetch-corpus.sh                 # ~100 MB into rules/tools/corpus
//   CLASSIFIER_CORPUS=<dir> npx vitest run detectLanguage.corpus
//
// Two registers, reported separately and on purpose. Tatoeba is conversational;
// Wikipedia is third-person prose and much closer to the documents the classifier
// actually sees, so it is the number that matters. Profiles are derived from the
// training half of both (rules/tools/derive-profiles.py) and this reads the held-
// out half, so a score here is generalisation rather than recall.

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  classifyHeuristic,
  detectLanguage,
} from "@app/services/heuristic/heuristicEngine";
import type { HeuristicDoc } from "@app/services/heuristic/types";

const CORPUS = process.env.CLASSIFIER_CORPUS ?? path.join(__dirname, "corpus");
const present = fs.existsSync(path.join(CORPUS, "test_corpora"));

/** Floors, not targets: they exist to catch a regression, not to be admired. */
const EXACT_FLOOR = { tatoeba: 0.95, wiki: 0.85 } as const;
const TOP2_FLOOR = { tatoeba: 0.99, wiki: 0.95 } as const;

const TAGS = fs.existsSync(path.join(__dirname, "languages.tsv"))
  ? fs
      .readFileSync(path.join(__dirname, "languages.tsv"), "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#") && !l.startsWith("tag"))
      .map((l) => l.split("\t")[0].trim())
  : [];

function docs(dir: string, perDoc: number, cap: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const tag of TAGS) {
    const file = path.join(CORPUS, dir, `${tag}.txt`);
    if (!fs.existsSync(file)) continue;
    const lines = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const built: string[] = [];
    for (
      let i = 0;
      i + perDoc <= lines.length && built.length < cap;
      i += perDoc
    ) {
      built.push(lines.slice(i, i + perDoc).join(" "));
    }
    if (built.length > 0) out.set(tag, built);
  }
  return out;
}

interface Score {
  n: number;
  exact: number;
  top2: number;
  confusion: Map<string, number>;
}

function measure(corpus: Map<string, string[]>): Map<string, Score> {
  const scores = new Map<string, Score>();
  for (const [tag, texts] of corpus) {
    const score: Score = { n: 0, exact: 0, top2: 0, confusion: new Map() };
    for (const text of texts) {
      const d = detectLanguage(text);
      score.n++;
      if (d.language === tag) score.exact++;
      else {
        const got = d.assumed ? "en(assumed)" : (d.language ?? "undecided");
        score.confusion.set(got, (score.confusion.get(got) ?? 0) + 1);
      }
      // Top-2 is the number that decides behaviour: the dispatcher loads two packs.
      if (d.candidates.slice(0, 2).some((c) => c.language === tag))
        score.top2++;
    }
    scores.set(tag, score);
  }
  return scores;
}

function render(title: string, scores: Map<string, Score>): [number, number] {
  let n = 0;
  let exact = 0;
  let top2 = 0;
  for (const s of scores.values()) {
    n += s.n;
    exact += s.exact;
    top2 += s.top2;
  }
  const rows = [...scores.entries()].sort(
    (a, b) => a[1].exact / a[1].n - b[1].exact / b[1].n,
  );
  const lines = [
    `\n===== ${title} =====`,
    `exact ${((100 * exact) / n).toFixed(1)}%   top-2 ${((100 * top2) / n).toFixed(1)}%   (${n} documents, ${scores.size} languages)`,
  ];
  for (const [tag, s] of rows) {
    const conf = [...s.confusion.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
    lines.push(
      `${tag.padEnd(4)}${String(s.n).padStart(5)}${((100 * s.exact) / s.n).toFixed(0).padStart(6)}%${((100 * s.top2) / s.n).toFixed(0).padStart(6)}%  ${conf}`,
    );
  }
  console.log(lines.join("\n"));
  return [exact / n, top2 / n];
}

describe.skipIf(!present)("language detection against real corpora", () => {
  it("identifies held-out Tatoeba documents", () => {
    const [exact, top2] = render(
      "TATOEBA held-out · 25 sentences per document",
      measure(docs("test_corpora", 25, 60)),
    );
    expect(exact).toBeGreaterThanOrEqual(EXACT_FLOOR.tatoeba);
    expect(top2).toBeGreaterThanOrEqual(TOP2_FLOOR.tatoeba);
  });

  it("identifies held-out Wikipedia prose, the register documents resemble", () => {
    const [exact, top2] = render(
      "WIKIPEDIA held-out · one extract per document",
      measure(docs("test_wiki", 1, 200)),
    );
    expect(exact).toBeGreaterThanOrEqual(EXACT_FLOOR.wiki);
    expect(top2).toBeGreaterThanOrEqual(TOP2_FLOOR.wiki);
  });

  it("degrades rather than guesses on short text", () => {
    // Six sentences is near the floor of what function words can carry. Exactness
    // is allowed to fall; claiming a wrong language confidently is not.
    const [, top2] = render(
      "TATOEBA held-out · 6 sentences per document",
      measure(docs("test_corpora", 6, 120)),
    );
    expect(top2).toBeGreaterThanOrEqual(0.97);
  });

  describe("small documents", () => {
    /** Natural text cut to roughly `words` words, built from whole sentences. */
    function sizedDocs(dir: string, words: number, perLanguage: number) {
      const out = new Map<string, string[]>();
      for (const tag of TAGS) {
        const file = path.join(CORPUS, dir, `${tag}.txt`);
        if (!fs.existsSync(file)) continue;
        const src = fs
          .readFileSync(file, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        const docs: string[] = [];
        let i = 0;
        while (docs.length < perLanguage && i < src.length) {
          const parts: string[] = [];
          let n = 0;
          while (n < words && i < src.length) {
            parts.push(src[i]);
            n += src[i].split(/\s+/).length;
            i++;
          }
          docs.push(parts.join(" ").split(/\s+/).slice(0, words).join(" "));
        }
        if (docs.length > 0) out.set(tag, docs);
      }
      return out;
    }

    it("still reaches the right language's pack on a 20-word document", () => {
      // A receipt or a delivery note is this short. Exactness falls to about
      // two-thirds here, but the dispatcher loads two packs and the runner-up
      // covers most of the gap - which is the number that decides behaviour.
      const [, top2] = render(
        "WIKIPEDIA held-out · 20 words per document",
        measure(sizedDocs("test_wiki", 20, 25)),
      );
      expect(top2).toBeGreaterThanOrEqual(0.8);
    });

    it("makes no language call at all when there is almost no text", () => {
      const d = detectLanguage("Faktura 2024-014");
      expect(d.language).toBeNull();
      expect(d.lowText).toBe(true);
    });

    it("never trusts a label on short non-document prose", async () => {
      // None of this text is a business document, so every label is a false
      // positive. Low and medium escalate to the AI engine and are survivable;
      // "high" would persist a wrong label without asking anyone.
      let high = 0;
      let labelled = 0;
      let total = 0;
      for (const [, docs] of sizedDocs("test_wiki", 40, 15)) {
        for (const text of docs) {
          const doc: HeuristicDoc = {
            fileName: "document.pdf",
            pageCount: 1,
            meta: {},
            titleZone: text.split(/\s+/).slice(0, 8).join(" "),
            firstZone: text,
            allZone: text,
          };
          const r = await classifyHeuristic(doc);
          total++;
          if (r.labels.length > 0) {
            labelled++;
            if (r.confidence === "high") high++;
          }
        }
      }
      console.log(
        `\n40-word non-document prose: ${total} documents, ${labelled} labelled (${((100 * labelled) / total).toFixed(1)}%), ${high} at high confidence`,
      );
      expect(total).toBeGreaterThan(100);
      expect(
        high / total,
        "a trusted label here skips the AI engine",
      ).toBeLessThanOrEqual(0.005);
    });
  });
});
