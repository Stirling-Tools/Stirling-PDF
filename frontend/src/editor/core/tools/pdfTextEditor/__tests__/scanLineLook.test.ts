// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  isScanRun,
  prefitScanRun,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  _resetScanFacesForTests,
  _setBundledScanFacesForTests,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { readBundledFaces } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

const FIXTURE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/scanned-ocr-outlined-address.pdf",
);

class TestImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

let bundled: Face[] = [];
const stores: EditorStore[] = [];
const docs: EditorDocument[] = [];

beforeAll(async () => {
  const wasmBytes = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal("ImageData", TestImageData);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
  bundled = await readBundledFaces();
});

beforeEach(() => _setBundledScanFacesForTests(bundled));

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  for (const doc of docs.splice(0)) doc.dispose();
});

afterAll(() => {
  _resetScanFacesForTests();
  vi.unstubAllGlobals();
});

async function openAddress() {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(FIXTURE)),
  );
  const store = new EditorStore();
  stores.push(store);
  await store.setDocument(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  const run = page.runs.find((r) => isScanRun(r) && r.text.includes("4EE"))!;
  while (!prefitScanRun(doc, page, run, performance.now() + 50))
    await new Promise((resolve) => setTimeout(resolve, 0));
  return { doc, store, run };
}

const FILL_AND_STROKE = 2;

function drawnHeavy(doc: EditorDocument, run: TextRun): boolean[] {
  const m = doc.module;
  return (run.scanEdit?.textPtrs ?? []).map((p) => {
    const font = m.FPDFTextObj_GetFont(p);
    const len = m.FPDFFont_GetBaseFontName(font, 0, 0);
    const buf = m.pdfium.wasmExports.malloc(len);
    try {
      m.FPDFFont_GetBaseFontName(font, buf, len);
      return (
        /bold/i.test(m.pdfium.UTF8ToString(buf)) ||
        m.FPDFTextObj_GetTextRenderMode(p) === FILL_AND_STROKE
      );
    } finally {
      m.pdfium.wasmExports.free(buf);
    }
  });
}

async function visibleRunsAfterSave(doc: EditorDocument) {
  const saved = await EditorDocument.open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  docs.push(saved);
  const page = saved.page(0);
  PdfiumTextReader.populate(saved, page);
  return page.runs.filter((r) => !isScanRun(r) && r.text.trim() !== "");
}

test(
  "a word typed into a black line of a scanned paragraph keeps that line's colour and weight, not a blue bold line's below it",
  { timeout: 180_000 },
  async () => {
    const { doc, store, run } = await openAddress();
    expect(run.text.split("\n")).toHaveLength(5);

    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.replace("4EE", "4EEX"),
      }),
    );
    const heavy = drawnHeavy(doc, run);
    expect(heavy.length).toBeGreaterThan(0);
    expect(heavy.every((h) => !h)).toBe(true);

    const typed = (await visibleRunsAfterSave(doc)).filter((r) =>
      r.text.includes("4EEX"),
    );
    expect(typed.length).toBeGreaterThan(0);
    for (const r of typed) {
      expect(Math.max(r.fill.r, r.fill.g, r.fill.b)).toBeLessThan(80);
    }
  },
);

test(
  "a word typed into the blue bold line of the same paragraph stays blue and bold",
  { timeout: 180_000 },
  async () => {
    const { doc, store, run } = await openAddress();

    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.replace("contact", "contactX"),
      }),
    );
    const heavy = drawnHeavy(doc, run);
    expect(heavy.length).toBeGreaterThan(0);
    expect(heavy.every((h) => h)).toBe(true);

    const typed = (await visibleRunsAfterSave(doc)).filter((r) =>
      r.text.includes("contactX"),
    );
    expect(typed.length).toBeGreaterThan(0);
    for (const r of typed) {
      expect(r.fill.b).toBeGreaterThan(150);
      expect(r.fill.r).toBeLessThan(80);
    }
  },
);
