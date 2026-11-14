// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/rtl-sample.pdf",
);
const HEBREW_LINE = "שלום עולם וברוכים הבאים";
const FPDF_PAGEOBJ_TEXT = 1;

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith(".wasm")
        ? new Response(wasm, {
            headers: { "Content-Type": "application/wasm" },
          })
        : new Response(null, { status: 404 }),
    ),
  );
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function open(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

// The page's text as a reader extracts it, one entry per line.
function readLines(doc: EditorDocument): string[] {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  try {
    let text = "";
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++)
      text += String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i));
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  } finally {
    m.FPDFText_ClosePage(textPage);
  }
}

// Left and right ink edge of every text object drawn on the line around `y`.
function lineExtent(
  doc: EditorDocument,
  y: number,
): { left: number; right: number } {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const box = m.pdfium.wasmExports.malloc(16);
  let left = Infinity;
  let right = -Infinity;
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFPageObj_GetBounds(obj, box, box + 4, box + 8, box + 12);
      const bottom = m.pdfium.getValue(box + 4, "float");
      const top = m.pdfium.getValue(box + 12, "float");
      if (y < bottom - 2 || y > top + 2) continue;
      left = Math.min(left, m.pdfium.getValue(box, "float"));
      right = Math.max(right, m.pdfium.getValue(box + 8, "float"));
    }
  } finally {
    m.pdfium.wasmExports.free(box);
  }
  return { left, right };
}

function edit(
  doc: EditorDocument,
  history: HistoryStack,
  needle: string,
  next: (text: string) => string,
) {
  const run = doc.page(0).runs.find((r) => r.text.includes(needle))!;
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: next(run.text),
    }),
    doc,
  );
  return run;
}

describe("a right-to-left line", () => {
  test("reads in its own order", async () => {
    const doc = await open();

    expect(doc.page(0).runs.map((r) => r.text.trim())).toContain(HEBREW_LINE);
  });

  test("still reads correctly and keeps its right edge after a word is changed", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const run = doc.page(0).runs.find((r) => r.text.includes("שלום ע"))!;
    const y = run.bounds.y + run.bounds.height / 2;
    const before = lineExtent(doc, y);

    edit(doc, history, "שלום ע", (text) => text.replace("עולם", "עולם רב"));

    expect(readLines(doc)).toContain("שלום עולם רב וברוכים הבאים");
    expect(lineExtent(doc, y).right).toBeCloseTo(before.right, 0);
    expect(lineExtent(doc, y).left).toBeLessThan(before.left);
  });

  test("keeps its words while left-to-right text is typed after them", async () => {
    const doc = await open();
    const history = new HistoryStack();

    for (const typed of [" ", " Z", " Zq"])
      edit(doc, history, "שלום ע", (text) => text.replace(/ ?Z?q?$/, typed));

    const page = readLines(doc).join(" ");
    expect(page).toContain("שלום עולם וברוכים הבאים");
    expect(page).toContain("Zq");
  });

  test("comes back exactly on undo", async () => {
    const doc = await open();
    const history = new HistoryStack();
    const original = readLines(doc);

    edit(doc, history, "שלום ע", (text) => text.replace("עולם", "עולם רב"));
    history.undo(doc);

    expect(readLines(doc)).toEqual(original);
  });
});

describe("a right-to-left word in a left-to-right line", () => {
  test("reads in place after one is typed among the left-to-right words", async () => {
    const doc = await open();
    const history = new HistoryStack();

    edit(doc, history, "Mixed", (text) => text.replace("hello", "עולם hello"));

    expect(readLines(doc)).toContain("Mixed: עולם hello שלום world 123.");
  });
});
