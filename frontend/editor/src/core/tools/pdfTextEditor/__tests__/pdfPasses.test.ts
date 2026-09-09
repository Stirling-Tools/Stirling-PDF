import { describe, expect, it } from "vitest";
import { toLatin1 } from "@app/tools/pdfTextEditor/pdfdoc/bytes";
import { parseOps, tokenize } from "@app/tools/pdfTextEditor/pdfdoc/contentOps";
import { RawPdf } from "@app/tools/pdfTextEditor/pdfdoc/raw";
import { consolidateContents } from "@app/tools/pdfTextEditor/pdfdoc/passes/consolidateContents";
import {
  extractShadingDraws,
  preserveShadings,
} from "@app/tools/pdfTextEditor/pdfdoc/passes/preserveShadings";
import { prepareForEditing } from "@app/tools/pdfTextEditor/pdfdoc/prepareForEditing";
import {
  buildClassicPdf,
  singleContentPdf,
  splitContentPdf,
  streamBody,
} from "@app/tools/pdfTextEditor/__tests__/pdfFixtures";

describe("content-stream tokeniser", () => {
  it("treats a parenthesised string as one token even with escapes", () => {
    const tokens = tokenize("BT (a \\) b (c) d) Tj ET");
    expect(tokens.map((t) => t.text)).toEqual([
      "BT",
      "(a \\) b (c) d)",
      "Tj",
      "ET",
    ]);
  });

  it("groups operands with their operator", () => {
    const ops = parseOps("1 0 0 1 20 30 cm /Sh0 sh");
    expect(ops).toHaveLength(2);
    expect(ops[0].op).toBe("cm");
    expect(ops[0].operands).toEqual(["1", "0", "0", "1", "20", "30"]);
    expect(ops[1].op).toBe("sh");
    expect(ops[1].operands).toEqual(["/Sh0"]);
  });

  it("does not lex the binary payload of an inline image", () => {
    const ops = parseOps("BI /W 2 ID \u0001q\u0000Q EI Q");
    expect(ops.map((o) => o.op)).toEqual(["BI", "EI", "Q"]);
  });

  it("does not treat true/false/R as operators", () => {
    const ops = parseOps("/GS0 gs true /X Do");
    expect(ops.map((o) => o.op)).toEqual(["gs", "Do"]);
  });
});

describe("consolidateContents", () => {
  it("merges a multi-part /Contents array into a single stream", async () => {
    const original = splitContentPdf(["q 1 0 0", "1 0 0 cm", "Q"]);
    const result = await consolidateContents(original);
    expect(result?.pages).toEqual([0]);

    const pdf = await RawPdf.parse(result?.bytes as Uint8Array);
    const pageNum = pdf?.pageNumberAt(0) ?? 0;
    const body = pdf?.objectBody(pageNum) ?? "";
    expect(pdf?.contentRefs(body)).toHaveLength(1);

    const content = toLatin1(
      (await pdf?.pageContent(pageNum)) ?? new Uint8Array(),
    );
    expect(content.replace(/\s+/g, " ").trim()).toBe("q 1 0 0 1 0 0 cm Q");
  });

  it("separates the parts so two of them cannot fuse into one token", async () => {
    const result = await consolidateContents(
      splitContentPdf(["1 0 0 1 0 0", "cm"]),
    );
    const pdf = await RawPdf.parse(result?.bytes as Uint8Array);
    const content = toLatin1(
      (await pdf?.pageContent(pdf?.pageNumberAt(0) ?? 0)) ?? new Uint8Array(),
    );
    expect(parseOps(content).map((o) => o.op)).toEqual(["cm"]);
  });

  it("keeps the rewritten reference lexable when /Contents has no separator", async () => {
    const original = splitContentPdf(["q", "Q"], true);
    expect(toLatin1(original)).toContain("/Contents[");
    const result = await consolidateContents(original);
    const pdf = await RawPdf.parse(result?.bytes as Uint8Array);
    const pageNum = pdf?.pageNumberAt(0) ?? 0;
    const body = pdf?.objectBody(pageNum) ?? "";
    // Splicing without a gap yields the single name token "/Contents5",
    // which costs the page every one of its objects.
    expect(body).not.toMatch(/\/Contents\d/);
    expect(pdf?.contentRefs(body)).toHaveLength(1);
    const content = toLatin1(
      (await pdf?.pageContent(pageNum)) ?? new Uint8Array(),
    );
    expect(content.replace(/\s+/g, " ").trim()).toBe("q Q");
  });

  it("leaves a single-stream document alone", async () => {
    expect(await consolidateContents(singleContentPdf())).toBeNull();
  });

  it("leaves the original bytes intact", async () => {
    const original = splitContentPdf(["q", "Q"]);
    const result = await consolidateContents(original);
    const out = result?.bytes as Uint8Array;
    expect(out.slice(0, original.length)).toEqual(original);
  });
});

describe("prepareForEditing", () => {
  it("merges split content streams on the way in", async () => {
    const out = await prepareForEditing(splitContentPdf(["q", "Q"]));
    const pdf = await RawPdf.parse(out);
    const body = pdf?.objectBody(pdf?.pageNumberAt(0) ?? 0) ?? "";
    expect(pdf?.contentRefs(body)).toHaveLength(1);
  });

  it("returns the same buffer when there is nothing to repair", async () => {
    const original = singleContentPdf();
    expect(await prepareForEditing(original)).toBe(original);
  });

  it("returns the input untouched rather than throwing on a broken file", async () => {
    const broken = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0xff, 0xfe,
    ]);
    expect(await prepareForEditing(broken)).toBe(broken);
  });
});

describe("extractShadingDraws", () => {
  it("returns null for a page with no shading", () => {
    expect(extractShadingDraws("BT (hi) Tj ET")).toBeNull();
  });

  it("keeps the state that positions the shading and drops the text", () => {
    const extracted = extractShadingDraws(
      "q 1 0 0 1 10 20 cm /GS0 gs /Sh0 sh Q BT /F1 12 Tf (hello) Tj ET",
    );
    expect(extracted).not.toBeNull();
    expect(extracted?.content).toContain("1 0 0 1 10 20 cm");
    expect(extracted?.content).toContain("/GS0 gs");
    expect(extracted?.content).toContain("/Sh0 sh");
    expect(extracted?.content).not.toContain("Tj");
    expect(extracted?.content).not.toContain("Tf");
    expect(extracted?.needs.shading).toEqual(["Sh0"]);
    expect(extracted?.needs.extGState).toEqual(["GS0"]);
  });

  it("keeps a clip path but paints nothing else", () => {
    const extracted = extractShadingDraws(
      "q 0 0 100 100 re W n 1 0 0 rg 5 5 10 10 re f /Sh0 sh Q",
    );
    expect(extracted?.content).toContain("0 0 100 100 re");
    expect(extracted?.content).toContain("W");
    // The filled rectangle must survive as a path but never be painted.
    expect(extracted?.content).not.toMatch(/(^|\n)f($|\n)/);
    expect(extracted?.content).toContain("5 5 10 10 re");
  });

  it("balances a stream whose q/Q pairs the generator left dangling", () => {
    const extracted = extractShadingDraws("q q /Sh0 sh");
    const ops = parseOps(extracted?.content ?? "");
    const opens = ops.filter((o) => o.op === "q").length;
    const closes = ops.filter((o) => o.op === "Q").length;
    expect(opens).toBe(closes);
  });

  it("recognises a shading drawn before any text as a background", () => {
    expect(extractShadingDraws("/Sh0 sh BT (x) Tj ET")?.isBackground).toBe(
      true,
    );
    expect(extractShadingDraws("BT (x) Tj ET /Sh0 sh")?.isBackground).toBe(
      false,
    );
  });

  it("ignores shadings drawn inside a form XObject, which regeneration keeps", () => {
    expect(extractShadingDraws("q /Fm0 Do Q")).toBeNull();
  });
});

/** A page whose gradient PDFium would drop, plus the saved file without it. */
function shadingFixtures(): { original: Uint8Array; saved: Uint8Array } {
  const resources =
    "/Resources << /Shading << /Sh0 6 0 R >> /Font << /F1 5 0 R >> >>";
  const pageBody = (contents: string): string =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] ${resources} /Contents ${contents} >>`;
  const common = [
    { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
    { num: 5, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    { num: 6, body: "<< /ShadingType 2 /ColorSpace /DeviceRGB >>" },
  ];
  return {
    original: buildClassicPdf(
      [
        ...common,
        { num: 3, body: pageBody("4 0 R") },
        {
          num: 4,
          body: streamBody(
            "",
            "q 200 0 0 200 0 0 cm /Sh0 sh Q BT /F1 12 Tf (hello) Tj ET",
          ),
        },
      ],
      1,
    ),
    saved: buildClassicPdf(
      [
        ...common,
        { num: 3, body: pageBody("4 0 R") },
        { num: 4, body: streamBody("", "BT /F1 12 Tf (hello there) Tj ET") },
      ],
      1,
    ),
  };
}

describe("preserveShadings", () => {
  it("puts a dropped background gradient back, underneath the page content", async () => {
    const { original, saved } = shadingFixtures();
    const out = await preserveShadings(saved, original, { pages: [0] });
    expect(out).not.toBeNull();

    const pdf = await RawPdf.parse(out as Uint8Array);
    const pageNum = pdf?.pageNumberAt(0) ?? 0;
    const refs = pdf?.contentRefs(pdf?.objectBody(pageNum) ?? "") ?? [];
    expect(refs).toHaveLength(2);

    const first = toLatin1(
      (await pdf?.streamData(refs[0])) ?? new Uint8Array(),
    );
    expect(first).toContain("/Sh0 sh");
    expect(first).toContain("200 0 0 200 0 0 cm");

    const second = toLatin1(
      (await pdf?.streamData(refs[1])) ?? new Uint8Array(),
    );
    expect(second).toContain("hello there");
  });

  it("does nothing when no page was regenerated", async () => {
    const { original, saved } = shadingFixtures();
    expect(await preserveShadings(saved, original, { pages: [] })).toBeNull();
  });

  it("declines when the saved file no longer declares the shading resource", async () => {
    const { original } = shadingFixtures();
    const saved = buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body:
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
            "/Resources << >> /Contents 4 0 R >>",
        },
        { num: 4, body: streamBody("", "BT (hello) Tj ET") },
      ],
      1,
    );
    expect(await preserveShadings(saved, original, { pages: [0] })).toBeNull();
  });

  it("leaves the saved bytes intact when it does apply", async () => {
    const { original, saved } = shadingFixtures();
    const out = (await preserveShadings(saved, original, {
      pages: [0],
    })) as Uint8Array;
    expect(out.slice(0, saved.length)).toEqual(saved);
  });
});

describe("shading phase ordering", () => {
  it("keeps a background shading before the text and a later one after", () => {
    const content =
      "/ShBack sh BT /F1 12 Tf (hello) Tj ET q 1 0 0 1 5 5 cm /ShOver sh Q";
    const back = extractShadingDraws(content, "background");
    const over = extractShadingDraws(content, "foreground");
    expect(back?.needs.shading).toEqual(["ShBack"]);
    expect(over?.needs.shading).toEqual(["ShOver"]);
    // The foreground fragment still replays the state that positions it.
    expect(over?.content).toContain("1 0 0 1 5 5 cm");
    expect(over?.content).not.toContain("/ShBack sh");
  });

  it("reports no fragment for a phase with no shading in it", () => {
    const content = "/Sh0 sh BT (x) Tj ET";
    expect(extractShadingDraws(content, "foreground")).toBeNull();
    expect(extractShadingDraws(content, "background")).not.toBeNull();
  });

  it("treats every shading as background when the page has no text", () => {
    const content = "q /Sh0 sh Q";
    expect(extractShadingDraws(content, "background")?.isBackground).toBe(true);
  });
});
