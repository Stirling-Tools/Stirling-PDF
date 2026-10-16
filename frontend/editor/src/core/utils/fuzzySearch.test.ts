// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  scoreMatch,
  minScoreForQuery,
  isFuzzyMatch,
  rankByFuzzy,
} from "@app/utils/fuzzySearch";

describe("scoreMatch", () => {
  it("scores substring matches highest", () => {
    expect(scoreMatch("rota", "Rotate")).toBeGreaterThanOrEqual(90);
    expect(scoreMatch("priv", "private")).toBeGreaterThanOrEqual(
      minScoreForQuery("priv"),
    );
  });

  it("tolerates small typos", () => {
    expect(isFuzzyMatch("rotaet", "rotate")).toBe(true);
    expect(isFuzzyMatch("comprss", "compress")).toBe(true);
    // Typo inside one token of a multi-word target
    expect(isFuzzyMatch("watermrk", "Add Watermark")).toBe(true);
  });

  it("doesn't treat a short word as a typo of the query", () => {
    expect(isFuzzyMatch("ocr", "Add text or add image stamps")).toBe(false);
    expect(isFuzzyMatch("ocr", "OCR / Cleanup scans")).toBe(true);
  });

  it("rejects unrelated words that share half their letters", () => {
    // Unrelated words can share many letters (rotate vs update is edit
    // distance 3 of 6) but must not be treated as a fuzzy match.
    expect(isFuzzyMatch("rotate", "update")).toBe(false);
    expect(isFuzzyMatch("rotate", "create")).toBe(false);
    expect(isFuzzyMatch("rotate", "private")).toBe(false);
    expect(isFuzzyMatch("rotate", "isolated")).toBe(false);
    expect(isFuzzyMatch("rotate", "automate")).toBe(false);
    expect(isFuzzyMatch("rotate", "annotate")).toBe(false);
    expect(isFuzzyMatch("rotat", "protect")).toBe(false);
    expect(isFuzzyMatch("rotat", "redact")).toBe(false);
    expect(isFuzzyMatch("rotat", "contrast")).toBe(false);
    expect(isFuzzyMatch("rotat", "annotate")).toBe(false);
  });
});

describe("scoreMatch on multi-word queries", () => {
  it("ignores filler words alongside a real match", () => {
    expect(isFuzzyMatch("compress pdf", "Compress")).toBe(true);
    expect(isFuzzyMatch("compress the file", "Compress")).toBe(true);
  });

  it("matches words in any order but ranks the exact phrase higher", () => {
    expect(isFuzzyMatch("password add", "Add Password")).toBe(true);
    expect(scoreMatch("add password", "Add Password")).toBeGreaterThan(
      scoreMatch("password add", "Add Password"),
    );
  });

  it("requires every meaningful word to match", () => {
    expect(isFuzzyMatch("rotate chapters", "Rotate")).toBe(false);
  });

  it("does not let field length bury an exact phrase", () => {
    const long =
      "Remove specific pages from a PDF document, keeping the rest in order";
    expect(isFuzzyMatch("keeping the rest", long)).toBe(true);
  });

  it("only matches mid-word fragments that cover most of the word", () => {
    expect(isFuzzyMatch("swor", "Add Password")).toBe(false);
    expect(isFuzzyMatch("compres", "Compress")).toBe(true);
  });

  it("matches the tail of a compound word, below a whole-word match", () => {
    expect(isFuzzyMatch("data", "Change Metadata")).toBe(true);
    expect(scoreMatch("word", "Add Password")).toBeLessThan(
      scoreMatch("word", "PDF to Word"),
    );
  });

  it("matches inside unspaced scripts", () => {
    expect(isFuzzyMatch("合并", "合并PDF文件")).toBe(true);
    expect(isFuzzyMatch("文件", "合并PDF文件")).toBe(true);
    // A Latin word next to CJK text is still a word.
    expect(isFuzzyMatch("word", "PDF转Word")).toBe(true);
  });

  it("keeps combining vowel signs inside the word", () => {
    // किताब: the vowel sign after क must not split the word, or a lone
    // consonant ("त") would match as the start of a fragment.
    expect(isFuzzyMatch("त", "किताब")).toBe(false);
    expect(isFuzzyMatch("खोलें किताब", "किताब खोलें")).toBe(true);
  });
});

describe("rankByFuzzy fields", () => {
  const items = [
    { name: "Rotate", tags: ["turn", "landscape"], desc: "" },
    { name: "Crop", tags: [], desc: "Trim pages, then rotate if needed" },
  ];

  it("scores list fields phrase by phrase and weights fields", () => {
    const ranked = rankByFuzzy(items, "rotate", [
      (i) => i.name,
      (i) => i.tags,
      { get: (i) => i.desc, weight: 0.7 },
    ]);
    expect(ranked.map((r) => r.item.name)).toEqual(["Rotate", "Crop"]);
    expect(ranked[1].score).toBeLessThan(ranked[0].score);
  });

  it("matches fragments mid-word only in fields that opt in", () => {
    const files = [{ name: "Invoice2024Final.pdf" }, { name: "ReeceCV.pdf" }];
    const anywhere = (query: string) =>
      rankByFuzzy(files, query, [{ get: (f) => f.name, anywhere: true }]).map(
        (r) => r.item.name,
      );
    expect(anywhere("2024")).toEqual(["Invoice2024Final.pdf"]);
    expect(anywhere("cv")).toEqual(["ReeceCV.pdf"]);
    expect(rankByFuzzy(files, "2024", [(f) => f.name])).toEqual([]);
  });

  it("combines fields to cover a multi-word query", () => {
    const ranked = rankByFuzzy(items, "rotate landscape", [
      (i) => i.name,
      (i) => i.tags,
    ]);
    expect(ranked.map((r) => r.item.name)).toEqual(["Rotate"]);
  });
});

describe("minScoreForQuery", () => {
  it("does not loosen the threshold for long queries", () => {
    expect(minScoreForQuery("rot")).toBe(40);
    expect(minScoreForQuery("rotate")).toBe(30);
    expect(minScoreForQuery("orientation")).toBe(30);
  });
});
