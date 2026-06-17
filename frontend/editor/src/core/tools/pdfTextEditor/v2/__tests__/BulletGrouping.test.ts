import { describe, it, expect } from "vitest";
import { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { LineGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/LineGrouper";
import { ParagraphGrouper } from "@app/tools/pdfTextEditor/v2/pdfium/ParagraphGrouper";

// Reproduces the "Plus Many More" two-column bulleted-list geometry from
// public/samples/Sample.pdf page 3 (probed from the live editor): bullets are
// separate text objects indented ~14pt left of their item text, and in the
// bottom section the bullet font (13.5) sits ~2.3pt above the item font (11.3).
// The grouper must pair each bullet with its OWN item (one run per item,
// bullet at the start) and must NOT merge across the column gutter.

let ptr = 1000;
function mkRun(opts: {
  x: number;
  width: number;
  f: number;
  fs: number;
  text: string;
}): TextRun {
  return new TextRun({
    id: `r${ptr}`,
    pageIndex: 0,
    bounds: { x: opts.x, y: opts.f, width: opts.width, height: opts.fs },
    matrix: { a: opts.fs, b: 0, c: 0, d: opts.fs, e: opts.x, f: opts.f },
    text: opts.text,
    fontId: "pdf:1:Test",
    fontSize: opts.fs,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: ptr++,
    containerPtr: 0,
  });
}

function group(runs: TextRun[]): TextRun[] {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  page.setRuns(runs);
  page.loaded = true;
  LineGrouper.apply(page);
  ParagraphGrouper.apply(page);
  return page.runs;
}

describe("bullet-to-item grouping (Plus Many More)", () => {
  it("pairs each bullet with its own item and keeps columns separate", () => {
    const runs: TextRun[] = [
      // Bottom "Plus Many More" section: bullet fs13.5, item fs11.3,
      // bullet baseline ~2.3pt above the item, ~14-17pt indent.
      // LEFT column
      mkRun({ x: 66, width: 3, f: 178.9, fs: 13.5, text: "• " }),
      mkRun({
        x: 83,
        width: 111,
        f: 176.6,
        fs: 11.3,
        text: "OCR  text  recognition",
      }),
      mkRun({ x: 66, width: 3, f: 153.4, fs: 13.5, text: "• " }),
      mkRun({ x: 83, width: 80, f: 151.1, fs: 11.3, text: "Compress  PDFs" }),
      // RIGHT column (gutter ~245pt to the right)
      mkRun({ x: 311, width: 3, f: 178.9, fs: 13.5, text: "• " }),
      mkRun({ x: 328, width: 101, f: 176.6, fs: 11.3, text: "Flatten  forms" }),
      mkRun({ x: 311, width: 3, f: 153.4, fs: 13.5, text: "• " }),
      mkRun({
        x: 328,
        width: 95,
        f: 151.1,
        fs: 11.3,
        text: "PDF/A  conversion",
      }),
    ];
    const out = group(runs);

    // No orphan bullet-only run (the reported bug = a stacked bullet column).
    const orphan = out.find(
      (r) => /^[\s•]+$/.test(r.text) && (r.text.match(/•/g) ?? []).length >= 2,
    );
    expect(orphan, `orphan bullet run: ${orphan?.text}`).toBeUndefined();

    // Each item's run starts with the bullet and does not swallow a foreign item.
    const ocr = out.find((r) => /OCR\s+text/.test(r.text));
    expect(ocr, "OCR run exists").toBeTruthy();
    expect(ocr!.text.trimStart().startsWith("•")).toBe(true);
    expect(ocr!.text).not.toMatch(/Flatten/); // not merged across the gutter

    const flatten = out.find((r) => /Flatten\s+forms/.test(r.text));
    expect(flatten, "Flatten run exists").toBeTruthy();
    expect(flatten!.text.trimStart().startsWith("•")).toBe(true);
    expect(flatten!.text).not.toMatch(/OCR/);
  });

  it("pairs same-baseline bullets (upper lists) with their item", () => {
    const runs: TextRun[] = [
      mkRun({ x: 66, width: 3, f: 642.4, fs: 10.5, text: "• " }),
      mkRun({
        x: 80,
        width: 91,
        f: 642.4,
        fs: 10.5,
        text: "Merge  &  split  PDFs",
      }),
    ];
    const out = group(runs);
    const merge = out.find((r) => /Merge/.test(r.text));
    expect(merge!.text.trimStart().startsWith("•")).toBe(true);
  });
});
