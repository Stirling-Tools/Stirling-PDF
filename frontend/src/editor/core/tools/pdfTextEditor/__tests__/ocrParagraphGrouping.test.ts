// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { ParagraphGrouper } from "@editor/tools/pdfTextEditor/pdfium/ParagraphGrouper";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  RENDER_MODE_INVISIBLE,
  type PageRuleSnapshot,
} from "@editor/tools/pdfTextEditor/types";

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasm, { headers: { "Content-Type": "application/wasm" } }),
    ),
  );
});

afterAll(() => vi.unstubAllGlobals());

async function readFixture(name: string): Promise<EditorDocument> {
  return EditorDocument.open(
    new Uint8Array(
      await readFile(
        path.join(import.meta.dirname, "../../../tests/test-fixtures", name),
      ),
    ),
  );
}

async function fixtureRuns(name: string): Promise<string[]> {
  const doc = await readFixture(name);
  try {
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    return page.runs.map((run) => run.text.trim());
  } finally {
    doc.dispose();
  }
}

test("reads a scanned paragraph whose lines OCR sized a point or two apart as one paragraph", async () => {
  const doc = await readFixture("scanned-ocr-paragraph.pdf");
  try {
    const page = doc.page(0);
    PdfiumTextReader.populate(doc, page);
    expect(page.runs.map((run) => run.text.split("\n").length)).toEqual([4, 1]);
    expect(page.runs[0].text).toMatch(/^This agreement.*\nwill deliver/);
    expect(page.runs[0].text).toMatch(/\ninterest at two percent per month\.$/);
    expect(page.runs[1].text).toBe("Signed: Maria Silva");
  } finally {
    doc.dispose();
  }
});

describe("a web receipt printed as outlines and OCR'd", () => {
  test("reads its footer address as one block, though OCR sizes its first line far smaller", async () => {
    expect(await fixtureRuns("scanned-ocr-receipt.pdf")).toContain(
      [
        "Il Forno Trading Limited",
        "lliffe House, Unit 4",
        "Kingsway Road, Bristol",
        "United Kingdom BS1 6QA",
        "Registered in England 0458812",
      ].join("\n"),
    );
  });

  test("reads a paragraph of small loosely led text as one paragraph", async () => {
    const runs = await fixtureRuns("scanned-ocr-receipt.pdf");
    expect(runs).toContain(
      "Questions about this payment can be sent to our support team, who will reply within two working days\nof receiving your message.",
    );
    expect(runs).toContain(
      "Thank you for your order. This receipt confirms the payment we received for the items listed below and\ncan be kept for your records.",
    );
  });

  test("keeps the heading and every cell of the bordered table their own boxes", async () => {
    expect(await fixtureRuns("scanned-ocr-receipt.pdf")).toEqual(
      expect.arrayContaining([
        "Payment receipt",
        "Order number",
        "Payment date",
        "Payment method",
        "Amount paid",
        "Northwind 88213",
        "Monday 3 March",
        "Visa ending 4417",
        "Forty two pounds",
      ]),
    );
  });
});

test("keeps the double-spaced lines of a scanned invoice apart", async () => {
  for (const fixture of ["scanned-ocr-hocr.pdf", "scanned-ocr-sandwich.pdf"])
    expect(await fixtureRuns(fixture)).toEqual(
      expect.arrayContaining([
        "Customer: Jane Example",
        "Date: 12 September 2026",
        "Please pay within thirty days of receipt.",
        "Thank you for your business.",
      ]),
    );
});

test("reads a typed address whose lines OCR stretched differently as one block", async () => {
  expect(await fixtureRuns("scanned-ocr-typewriter-form.pdf")).toContain(
    "NORTH HARBOUR TRADING CO\n12-4, 88 RIVERSIDE ROAD, EASTPORT\nTEL   :     44-20-555-0147/9",
  );
});

const OCR_HEIGHT = 3.1;
let ptr = 5000;

// An OCR line as ocrmypdf writes it: the upright scale is the line's height, and the sideways one fits its first word to the scan.
function ocrLine(
  text: string,
  x: number,
  baseline: number,
  stretch: number,
  slope = 0,
): TextRun {
  return new TextRun({
    id: `o${ptr}`,
    pageIndex: 0,
    bounds: {
      x,
      y: baseline - 0.6,
      width: text.length * 2.2,
      height: 2.45,
    },
    matrix: { a: stretch, b: slope * stretch, c: 0, d: 1, e: x, f: baseline },
    text,
    fontId: "pdf:1:GlyphLessFont",
    fontSize: OCR_HEIGHT * Math.hypot(stretch, slope * stretch),
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: ptr++,
    containerPtr: 0,
    renderMode: RENDER_MODE_INVISIBLE,
  });
}

function rule(x: number, y: number, width: number): PageRuleSnapshot {
  return {
    x,
    y,
    width,
    height: 0.75,
    ptr: 1,
    thickness: 0.75,
    color: { r: 0, g: 0, b: 0, a: 255 },
  };
}

function group(runs: TextRun[], rules: PageRuleSnapshot[] = []): string[] {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  page.setRuns(runs);
  page.setRules(rules);
  page.loaded = true;
  ParagraphGrouper.apply(page);
  return page.runs.map((run) => run.text);
}

const ADDRESS = [
  "Northwind Trading Limited",
  "Unit 4 Harbour Business Park",
  "Kingsway Road, Bristol",
  "United Kingdom BS1 6QA",
  "Registered in England 0458812",
];

describe("grouping OCR lines whose reported sizes are noise", () => {
  test("reads an address OCR sized 1.6, 2.2 and 3.1 as one block", () => {
    const stretches = [0.52, 0.71, 1, 1, 1];
    const runs = ADDRESS.map((text, i) =>
      ocrLine(text, 20, 200 - i * 7, stretches[i]),
    );
    expect(runs.map((run) => run.fontSize.toFixed(1))).toEqual([
      "1.6",
      "2.2",
      "3.1",
      "3.1",
      "3.1",
    ]);
    expect(group(runs)).toEqual([ADDRESS.join("\n")]);
  });

  test("keeps the words of a sideways scan apart", () => {
    const runs = ADDRESS.map((text, i) =>
      ocrLine(text, 20, 200 - i * 7, 1, 0.2),
    );
    expect(group(runs)).toHaveLength(ADDRESS.length);
  });

  test("keeps two addresses a paragraph's gap apart as two blocks", () => {
    const runs = [
      ...ADDRESS.slice(0, 2).map((text, i) =>
        ocrLine(text, 20, 300 - i * 7, 1),
      ),
      ...ADDRESS.slice(2).map((text, i) => ocrLine(text, 20, 270 - i * 7, 1)),
    ];
    expect(group(runs)).toEqual([
      ADDRESS.slice(0, 2).join("\n"),
      ADDRESS.slice(2).join("\n"),
    ]);
  });

  test("keeps labels and values on one row apart, and each row its own box", () => {
    const rows = [
      ["Order number", "Northwind 88213"],
      ["Payment date", "Monday 3 March"],
      ["Payment method", "Visa ending 4417"],
    ];
    const runs = rows.flatMap(([label, value], r) => [
      ocrLine(label, 20, 300 - r * 7, 1),
      ocrLine(value, 230, 300 - r * 7, 1),
    ]);
    expect(group(runs).sort()).toEqual(rows.flat().sort());
  });

  test("keeps the rows of a bordered table apart", () => {
    const rows = ["Collected from the Kingsway", "store on Monday morning"];
    const runs = rows.map((text, r) => ocrLine(text, 20, 300 - r * 7, 1));
    expect(group(runs, [rule(16, 296.5, 120)])).toEqual(rows);
    expect(
      group(runs.map((run) => ocrLine(run.text, 20, run.matrix.f, 1))),
    ).toEqual([rows.join("\n")]);
  });
});

interface ScanLine {
  text: string;
  x: number;
  f: number;
  width: number;
  fontSize: number;
  a: number;
  b?: number;
  c?: number;
}

// A receipt's OCR lines with the geometry PDFium reported for them.
function scanLine({
  text,
  x,
  f,
  width,
  fontSize,
  a,
  b = 0,
  c = 0,
}: ScanLine): TextRun {
  return new TextRun({
    id: `s${ptr}`,
    pageIndex: 0,
    bounds: { x, y: f, width, height: 2.5 },
    matrix: { a, b, c, d: 1, e: x, f },
    text,
    fontId: "pdf:1:GlyphLessFont",
    fontSize,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: ptr++,
    containerPtr: 0,
    renderMode: RENDER_MODE_INVISIBLE,
  });
}

const RECEIPT_ADDRESS = [
  "Flat Seven Harbour Mews",
  "Kings Road",
  "North Quay",
  "BRISTOL, Avon",
  "BS1 6QA",
];
const RECEIPT_FOOTER = [
  "*¢   Help",
  "©   Contact",
  "¢      Returns a Refunds",
  "¢      Terms  Privacy",
  "¢      Cookies’  Legal",
];

function receiptFooterRow(): TextRun[] {
  const baselines = [245.3, 238.3, 231.4, 224.4, 217.8];
  const address = RECEIPT_ADDRESS.map((text, i) =>
    scanLine({
      text,
      x: i === 4 ? 181.3 : 180.9,
      f: baselines[i],
      width: i === 0 ? 82.8 : i === 4 ? 16.5 : 40,
      fontSize: i === 4 ? 4.27 : 4.6,
      a: i === 4 ? 1.249 : 1.278,
    }),
  );
  const footer = RECEIPT_FOOTER.map((text, i) =>
    scanLine({
      text,
      x: i === 4 ? 322.5 : 322.3,
      f: [245.5, 238.6, 231.7, 224.8, 218.0][i],
      width: i === 0 ? 61.9 : 41.7,
      fontSize: i === 0 ? 1.6 : 3.15,
      a: i === 0 ? 0.495 : 0.971,
    }),
  );
  const below = [
    scanLine({
      text: "Order placed online",
      x: 181.4,
      f: 207.0,
      width: 50,
      fontSize: 4.74,
      a: 1.317,
    }),
    scanLine({
      text: "via the web shop",
      x: 181.4,
      f: 200.0,
      width: 45,
      fontSize: 4.74,
      a: 1.317,
    }),
    scanLine({
      text: "Thank you",
      x: 181.7,
      f: 193.3,
      width: 40,
      fontSize: 6.71,
      a: 0.887,
      b: 0.004,
      c: -0.005,
    }),
  ];
  return [...address, ...footer, ...below];
}

describe("an address and a footer side by side on a scanned receipt", () => {
  test("reads each as one block down to its last short line", () => {
    const runs = group(receiptFooterRow());
    expect(runs).toContain(RECEIPT_ADDRESS.join("\n"));
    expect(runs).toContain(RECEIPT_FOOTER.join("\n"));
  });

  test("keeps the lines below the address their own block", () => {
    expect(group(receiptFooterRow())).toContain(
      "Order placed online\nvia the web shop",
    );
  });
});
