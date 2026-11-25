// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const START = "Open Source editor";

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasm, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
  vi.restoreAllMocks();
});

afterAll(() => vi.unstubAllGlobals());

function samplePdf(inForm: boolean): Uint8Array {
  const line = `BT /F1 12 Tf 72 700 Td (${START}) Tj ET`;
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 6 0 R >> /XObject << /Fm1 5 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody("", inForm ? "q 1 0 0 1 0 0 cm /Fm1 Do Q" : line),
      },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 6 0 R >> >>",
          line,
        ),
      },
      {
        num: 6,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
    ],
    1,
  );
}

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

function drawnText(doc: EditorDocument): string {
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const count = m.FPDFText_CountChars(textPage);
  const buf = m.pdfium.wasmExports.malloc(2 * (count + 1));
  try {
    m.FPDFText_GetText(textPage, 0, count, buf);
    return m.pdfium.UTF16ToString(buf);
  } finally {
    m.pdfium.wasmExports.free(buf);
    m.FPDFText_ClosePage(textPage);
  }
}

// The page as drawn, independent of which native objects draw it: each object's kind and box in content order, and the text they read as.
function pageLayout(doc: EditorDocument): string {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const box = m.pdfium.wasmExports.malloc(16);
  try {
    const objects = Array.from(
      { length: m.FPDFPage_CountObjects(pagePtr) },
      (_, i) => {
        const ptr = m.FPDFPage_GetObject(pagePtr, i);
        m.FPDFPageObj_GetBounds(ptr, box, box + 4, box + 8, box + 12);
        const edges = [0, 4, 8, 12].map((at) =>
          m.pdfium.getValue(box + at, "float").toFixed(3),
        );
        return `${m.FPDFPageObj_GetType(ptr)}@${edges.join(",")}`;
      },
    );
    return JSON.stringify({ text: drawnText(doc), objects });
  } finally {
    m.pdfium.wasmExports.free(box);
  }
}

async function exportedText(doc: EditorDocument): Promise<string> {
  const saved = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  return pageLayout(saved);
}

// Objects ever taken off or put on the page, less those freed and those on it now: what nothing will ever free.
function trackStranded(doc: EditorDocument): () => number {
  const m = doc.module;
  const seen = new Set<number>();
  const freed = new Set<number>();
  const remove = m.FPDFPage_RemoveObject.bind(m);
  const insert = m.FPDFPage_InsertObject.bind(m);
  const destroy = m.FPDFPageObj_Destroy.bind(m);
  vi.spyOn(m, "FPDFPage_RemoveObject").mockImplementation((page, ptr) => {
    seen.add(ptr);
    return remove(page, ptr);
  });
  vi.spyOn(m, "FPDFPage_InsertObject").mockImplementation((page, ptr) => {
    seen.add(ptr);
    return insert(page, ptr);
  });
  vi.spyOn(m, "FPDFPageObj_Destroy").mockImplementation((ptr) => {
    freed.add(ptr);
    return destroy(ptr);
  });
  return () => {
    const pagePtr = doc.page(0).pagePtr;
    const onPage = new Set(
      Array.from({ length: m.FPDFPage_CountObjects(pagePtr) }, (_, i) =>
        m.FPDFPage_GetObject(pagePtr, i),
      ),
    );
    return [...seen].filter((ptr) => !freed.has(ptr) && !onPage.has(ptr))
      .length;
  };
}

describe.each([
  { where: "on the page", inForm: false },
  { where: "inside a form", inForm: true },
])("undoing and redoing a typed burst on text drawn $where", ({ inForm }) => {
  it.each([
    { edit: "typing before the text", steps: [`X ${START}`, `XY ${START}`] },
    {
      edit: "retyping inside a word",
      steps: ["Open Sorce editor", "Open Sorrce editors"],
    },
  ])(
    "keeps the same objects and the same page when $edit",
    async ({ steps }) => {
      const doc = await open(samplePdf(inForm));
      const run = doc.page(0).runs.find((r) => r.text === START)!;
      const history = new HistoryStack();
      for (const nextText of steps)
        history.execute(
          new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
          doc,
        );
      const stranded = trackStranded(doc);

      history.undo(doc);
      const undone = pageLayout(doc);
      history.redo(doc);
      const redone = pageLayout(doc);
      const redoneExport = await exportedText(doc);
      const afterOneCycle = stranded();

      for (let i = 0; i < 20; i++) {
        history.undo(doc);
        expect(pageLayout(doc)).toBe(undone);
        history.redo(doc);
        expect(pageLayout(doc)).toBe(redone);
      }

      expect(stranded()).toBeLessThanOrEqual(afterOneCycle);
      expect(drawnText(doc).replace(/\s/g, "")).toBe(
        steps.at(-1)!.replace(/\s/g, ""),
      );
      expect(await exportedText(doc)).toBe(redoneExport);
      history.undo(doc);
      expect(drawnText(doc).replace(/\s/g, "")).toBe(START.replace(/\s/g, ""));
    },
  );
});
