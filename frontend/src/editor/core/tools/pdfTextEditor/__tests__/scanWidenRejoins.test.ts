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
import { resizeRunCommand } from "@editor/tools/pdfTextEditor/commands/resizeRun";
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
  "../../../tests/test-fixtures/scanned-ocr-paragraph.pdf",
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
    (r) => isScanRun(r) && r.text.startsWith("This agreement"),
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

test(
  "widening a narrowed scanned paragraph back rejoins the lines the narrowing broke",
  { timeout: 180_000 },
  async () => {
    const { doc, store, run } = await fitted();
    const original = run.text;
    const width = run.bounds.width;

    store.dispatch(resizeRunCommand(doc, 0, run.id, width * 0.6)!);
    expect(run.text.split("\n").length).toBeGreaterThan(
      original.split("\n").length,
    );
    store.dispatch(resizeRunCommand(doc, 0, run.id, width + 1)!);

    expect(run.text).toBe(original);
  },
);

test(
  "widening a scanned paragraph past its margin joins the lines the scan wrapped, as one undo step",
  { timeout: 180_000 },
  async () => {
    const { doc, store, run } = await fitted();
    const original = run.text;

    store.dispatch(resizeRunCommand(doc, 0, run.id, run.bounds.width * 1.5)!);
    const widened = run.text;
    expect(widened.split("\n").length).toBeLessThan(
      original.split("\n").length,
    );
    expect(widened.replace(/\s+/g, " ")).toBe(original.replace(/\s+/g, " "));

    store.undo();
    expect(run.text).toBe(original);
    store.redo();
    expect(run.text).toBe(widened);
  },
);

const EDITS: Array<[string, (text: string) => string]> = [
  [
    "an Enter typed after a sentence",
    (text) => text.replace("customer. ", "customer. \n"),
  ],
  ["a typed word", (text) => text.replace("goods", "boxed goods")],
  ["a deleted word", (text) => text.replace("goods ", "")],
];

test.each(EDITS)(
  "after %s in a narrowed scanned paragraph, widening rejoins the wraps and keeps a typed break",
  { timeout: 180_000 },
  async (name, edit) => {
    const { doc, store, run } = await fitted();
    const width = run.bounds.width;

    store.dispatch(resizeRunCommand(doc, 0, run.id, width * 0.6)!);
    const narrowed = run.text;
    const edited = edit(narrowed);
    expect(edited).not.toBe(narrowed);
    store.dispatch(
      new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: edited }),
    );
    const linesBefore = run.text.split("\n").length;

    const widen = resizeRunCommand(doc, 0, run.id, width * 1.5);
    expect(widen).not.toBeNull();
    store.dispatch(widen!);
    const widened = run.text;

    expect(widened.split("\n").length).toBeLessThan(linesBefore);
    expect(widened.replace(/\s+/g, " ")).toBe(edited.replace(/\s+/g, " "));
    if (name.startsWith("an Enter"))
      expect(widened).toMatch(/customer\.\s*\n\s*The supplier/);

    store.undo();
    expect(run.text).toBe(edited);
    store.redo();
    expect(run.text).toBe(widened);
  },
);

test.each([
  ["narrowing and widening", (text: string) => text],
  [
    "an Enter typed after a sentence",
    (text: string) => text.replace("customer. ", "customer. \n"),
  ],
])(
  "after %s, a saved scanned paragraph reopens as one run with the same lines",
  { timeout: 180_000 },
  async (_name, edit) => {
    const { doc, store, run } = await fitted();
    const width = run.bounds.width;
    store.dispatch(resizeRunCommand(doc, 0, run.id, width * 0.6)!);
    const edited = edit(run.text);
    if (edited !== run.text)
      store.dispatch(
        new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: edited }),
      );
    store.dispatch(resizeRunCommand(doc, 0, run.id, width * 1.5)!);
    const lines = run.text.split("\n").map((line) => line.trim());

    const saved = new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
    const reopened = await openParagraph(saved);

    expect(
      reopened.page.runs.filter((r) => r.text.includes("agreement")),
    ).toHaveLength(1);
    expect(reopened.run.text.split("\n").map((line) => line.trim())).toEqual(
      lines,
    );
  },
);
