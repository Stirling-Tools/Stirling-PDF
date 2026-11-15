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

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/form-xobject-sample.pdf",
);
const SUBHEADING = "Subheading line below";
const FPDF_PAGEOBJ_TEXT = 1;

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

async function open(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

function pageLevelText(doc: EditorDocument): string {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  const buf = m.pdfium.wasmExports.malloc(1024);
  const textPage = m.FPDFText_LoadPage(pagePtr);
  let out = "";
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFTextObj_GetText(obj, textPage, buf, 1024);
      out += m.pdfium.UTF16ToString(buf);
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(buf);
  }
  return out;
}

describe("text typed into a form XObject run", () => {
  test("is removed from the page when it is deleted again", async () => {
    const doc = await open();
    const run = doc.page(0).runs.find((r) => r.text === SUBHEADING)!;
    expect(run.containerPtr).not.toBe(0);
    const edit = (nextText: string) =>
      new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }).apply(doc);

    edit(`${SUBHEADING} Zq7`);
    expect(pageLevelText(doc)).toContain("Zq7");

    edit(SUBHEADING);
    expect(run.text).toBe(SUBHEADING);
    expect(pageLevelText(doc)).not.toContain("Zq7");
  });
});
