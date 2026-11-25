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
import {
  isScanRun,
  prefitScanRun,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  _resetScanFacesForTests,
  _setBundledScanFacesForTests,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { readBundledFaces } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";
import { differingPixels } from "@editor/tools/pdfTextEditor/__tests__/pageRaster";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

const SCALE = 2;
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

function inkPixels(
  image: ImageData,
  page: Page,
  area: { x: number; y: number; width: number; height: number },
): number {
  let count = 0;
  const top = Math.floor((page.height - area.y - area.height) * SCALE);
  const bottom = Math.ceil((page.height - area.y) * SCALE);
  for (let y = Math.max(0, top); y < Math.min(image.height, bottom); y++)
    for (
      let x = Math.max(0, Math.floor(area.x * SCALE));
      x < Math.min(image.width, Math.ceil((area.x + area.width) * SCALE));
      x++
    ) {
      const i = (y * image.width + x) * 4;
      if (image.data[i] + image.data[i + 1] + image.data[i + 2] < 3 * 160)
        count++;
    }
  return count;
}

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

test(
  "narrowing a scanned paragraph rewraps its words into the new width, as one undo step",
  { timeout: 180_000 },
  async () => {
    const { doc, store, page, run } = await openParagraph(
      new Uint8Array(await readFile(FIXTURE)),
    );
    while (!prefitScanRun(doc, page, run, performance.now() + 50))
      await new Promise((resolve) => setTimeout(resolve, 0));
    const original = run.text;
    const oldBounds = { ...run.bounds };
    const width = oldBounds.width * 0.6;
    const before = await PdfiumPageRenderer.render(doc, page, SCALE);

    const cmd = resizeRunCommand(doc, 0, run.id, width);
    expect(cmd).toBeInstanceOf(EditTextCommand);
    store.dispatch(cmd!);

    const wrapped = run.text;
    const resized = { ...run.bounds };
    const lineHeight = oldBounds.height / original.split("\n").length;
    expect(resized.x).toBeGreaterThan(oldBounds.x - 2);
    expect(resized.x + resized.width).toBeLessThanOrEqual(
      oldBounds.x + width + 2,
    );
    expect(resized.height).toBeGreaterThan(
      lineHeight * (wrapped.split("\n").length - 0.5),
    );
    expect(wrapped.split("\n").length).toBeGreaterThan(
      original.split("\n").length,
    );
    expect(wrapped.replace(/\s+/g, " ")).toBe(original.replace(/\s+/g, " "));
    const after = await PdfiumPageRenderer.render(doc, page, SCALE);
    const right = oldBounds.x + width + 2;
    expect(
      inkPixels(after, page, {
        x: right,
        y: oldBounds.y - lineHeight * 3,
        width: oldBounds.x + oldBounds.width + 4 - right,
        height: oldBounds.height + lineHeight * 3,
      }),
    ).toBe(0);
    expect(
      inkPixels(before, page, {
        x: right,
        y: oldBounds.y,
        width: oldBounds.x + oldBounds.width + 4 - right,
        height: oldBounds.height,
      }),
    ).toBeGreaterThan(0);

    const lines = run.scanEdit!.lines;
    const inkTops = [...run.scanEdit!.inks]
      .filter(([key, ink]) => ink && key.split(":")[1] === key.split(":")[2])
      .map(([key, ink]) => {
        const [li, wi] = key.split(":").map(Number);
        const word = lines[li].words[wi];
        return {
          text: word.text.trim(),
          top: ink!.ink.rect.y + ink!.ink.rect.height - word.baseline,
        };
      });
    const tallest = Math.max(...inkTops.map((w) => w.top));
    expect(
      inkTops
        .filter((w) => /[ij]/.test(w.text) && w.top < tallest * 0.9)
        .map((w) => w.text),
    ).toEqual([]);

    store.undo();
    expect(run.text).toBe(original);
    expect(run.bounds).toEqual(oldBounds);
    expect(
      differingPixels(
        before,
        await PdfiumPageRenderer.render(doc, page, SCALE),
      ),
    ).toBe(0);

    store.redo();
    expect(run.text).toBe(wrapped);
    expect(run.bounds).toEqual(resized);
    expect(
      differingPixels(after, await PdfiumPageRenderer.render(doc, page, SCALE)),
    ).toBe(0);

    const saved = new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
    const reopened = await openParagraph(saved);
    expect(reopened.run.text).toBe(wrapped);
  },
);

test(
  "a resize straight after typing in a scanned paragraph undoes on its own",
  { timeout: 180_000 },
  async () => {
    const { doc, store, page, run } = await openParagraph(
      new Uint8Array(await readFile(FIXTURE)),
    );
    while (!prefitScanRun(doc, page, run, performance.now() + 50))
      await new Promise((resolve) => setTimeout(resolve, 0));
    const typed = run.text.replace("supplier\n", "supplier,\n");
    store.dispatch(
      new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: typed }),
    );
    store.dispatch(resizeRunCommand(doc, 0, run.id, run.bounds.width * 0.6)!);
    expect(run.text).not.toBe(typed);

    store.undo();
    expect(run.text).toBe(typed);
  },
);

test(
  "typing a line into a scanned paragraph grows its box, and undo puts the box back",
  { timeout: 180_000 },
  async () => {
    const { doc, store, page, run } = await openParagraph(
      new Uint8Array(await readFile(FIXTURE)),
    );
    while (!prefitScanRun(doc, page, run, performance.now() + 50))
      await new Promise((resolve) => setTimeout(resolve, 0));
    const original = run.text;
    const oldBounds = { ...run.bounds };
    const lineHeight = oldBounds.height / original.split("\n").length;

    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: `${original}\nThank you.`,
      }),
    );
    const grown = { ...run.bounds };
    expect(grown.y).toBeLessThan(oldBounds.y - lineHeight * 0.5);
    expect(grown.y + grown.height).toBeCloseTo(
      oldBounds.y + oldBounds.height,
      -1,
    );

    store.undo();
    expect(run.bounds).toEqual(oldBounds);
    store.redo();
    expect(run.bounds).toEqual(grown);
  },
);
