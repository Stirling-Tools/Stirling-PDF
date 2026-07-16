import { describe, expect, it } from "vitest";
import {
  buildSnippet,
  highlight,
  searchDocs,
  toPlainText,
  type SearchDoc,
} from "@portal/docs/search";

const DOCS: SearchDoc[] = [
  {
    id: "ocr",
    title: "OCR Guide",
    sectionLabel: "Configuration",
    text: "Stirling PDF uses Tesseract for its text recognition and language packs.",
  },
  {
    id: "docker",
    title: "Docker Install",
    sectionLabel: "Installation",
    text: "Run Stirling with docker compose up to start the container.",
  },
  {
    id: "ranky",
    title: "Something else",
    sectionLabel: "Misc",
    text: "docker docker docker appears many times in the body here.",
  },
];

describe("toPlainText", () => {
  it("strips headings, links, inline code, and code fences", () => {
    const md =
      "# Title\n\nSee [the guide](doc:x) and run `npm i`.\n\n```bash\nnpm run build\n```";
    const out = toPlainText(md);
    expect(out).toContain("Title");
    expect(out).toContain("the guide");
    expect(out).toContain("npm i");
    expect(out).toContain("npm run build"); // code text kept, fences dropped
    expect(out).not.toContain("#");
    expect(out).not.toContain("```");
    expect(out).not.toContain("](");
  });
});

describe("highlight", () => {
  it("splits text into hit/non-hit segments", () => {
    expect(highlight("Hello world", ["world"])).toEqual([
      { text: "Hello ", hit: false },
      { text: "world", hit: true },
    ]);
  });

  it("is safe against regex metacharacters in terms", () => {
    expect(() => highlight("a (b) c", ["("])).not.toThrow();
  });
});

describe("buildSnippet", () => {
  it("windows around the first match and marks it", () => {
    const text =
      "lorem ipsum ".repeat(20) + "the TARGET keyword " + "dolor ".repeat(20);
    const segs = buildSnippet(text, ["target"]);
    expect(segs.some((s) => s.hit && /target/i.test(s.text))).toBe(true);
    // Windowed, so it should be far shorter than the full text.
    expect(segs.map((s) => s.text).join("").length).toBeLessThan(text.length);
  });
});

describe("searchDocs", () => {
  it("returns nothing for an empty query", () => {
    expect(searchDocs(DOCS, "   ")).toEqual([]);
  });

  it("matches body content, not just titles (with a snippet)", () => {
    const res = searchDocs(DOCS, "tesseract");
    expect(res.map((r) => r.id)).toEqual(["ocr"]);
    expect(res[0].snippet.some((s) => s.hit && /tesseract/i.test(s.text))).toBe(
      true,
    );
  });

  it("ranks title matches above body matches", () => {
    const res = searchDocs(DOCS, "docker");
    // "Docker Install" (title hit) outranks "Something else" (body-only hits).
    expect(res[0].id).toBe("docker");
    expect(res.map((r) => r.id)).toContain("ranky");
  });

  it("requires every term to match (AND)", () => {
    expect(searchDocs(DOCS, "docker compose").map((r) => r.id)).toEqual([
      "docker",
    ]);
    expect(searchDocs(DOCS, "docker tesseract")).toEqual([]);
  });

  it("does not throw on regex-special-character queries", () => {
    expect(() => searchDocs(DOCS, "a(b")).not.toThrow();
  });
});
