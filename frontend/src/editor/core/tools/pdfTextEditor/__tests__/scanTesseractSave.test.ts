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
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  isScanRun,
  prefitScanRun,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
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
  "../../../tests/test-fixtures/scanned-ocr-tesseract.pdf",
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
});

afterAll(() => {
  _resetScanFacesForTests();
  vi.unstubAllGlobals();
});

async function openParagraph(bytes: Uint8Array) {
  const doc = await EditorDocument.open(bytes);
  const store = new EditorStore();
  stores.push(store);
  await store.setDocument(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  const run = page.runs.find(
    (r) => isScanRun(r) && r.text.startsWith("The quick"),
  )!;
  return { doc, store, page, run };
}

async function fitted() {
  const opened = await openParagraph(new Uint8Array(await readFile(FIXTURE)));
  while (
    !prefitScanRun(opened.doc, opened.page, opened.run, performance.now() + 50)
  )
    await new Promise((resolve) => setTimeout(resolve, 0));
  return opened;
}

const LINES = [
  "The quick brown fox jumps over the lazy dog while",
  "the farmer counts his sheep in the field. Pack my box with five dozen",
  "liquor jugs before the market closes for the evening.",
  "Sphinx of black quartz, judge my vow. How vexingly quick",
  "daft zebras jump when the wizard calls them home.",
];

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

test(
  "reads each Tesseract line whole, though every word's space overhangs the next",
  { timeout: 180_000 },
  async () => {
    const { run } = await openParagraph(
      new Uint8Array(await readFile(FIXTURE)),
    );
    expect(run.text.split("\n").map(flat)).toEqual(LINES);
  },
);

test(
  "keeps the space between every word of the lines a typed line pushes down",
  { timeout: 180_000 },
  async () => {
    const { doc, store, run } = await fitted();
    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.replace(/while\s*\n/, "while\nadded line\n"),
      }),
    );
    const saved = await EditorDocument.open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    try {
      const page = saved.page(0);
      PdfiumTextReader.populate(saved, page);
      const text = page.runs.map((r) => flat(r.text)).join(" ");
      expect(text).toBe(
        flat([LINES[0], "added line", ...LINES.slice(1)].join(" ")),
      );
    } finally {
      saved.dispose();
    }
  },
);
