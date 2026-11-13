// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  isScanRun,
  prefitScanRun,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  _resetScanFacesForTests,
  _setBundledScanFacesForTests,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import {
  buildScan,
  readBundledFaces,
} from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

const SCALE = 1.37;

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

function paste(onto: ImageData, area: ImageData, x: number, y: number) {
  for (let row = 0; row < area.height; row++) {
    const from = row * area.width * 4;
    onto.data.set(
      area.data.subarray(from, from + area.width * 4),
      ((y + row) * onto.width + x) * 4,
    );
  }
}

function differingPixels(a: ImageData, b: ImageData): number {
  let count = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      a.data[i] !== b.data[i] ||
      a.data[i + 1] !== b.data[i + 1] ||
      a.data[i + 2] !== b.data[i + 2]
    )
      count++;
  }
  return count;
}

describe("redrawing only the edited area of scanned text", () => {
  test.each([
    ["the third line", ["\nmore", "\nmore\nthi", "\nmore\nthir"]],
    ["the fourth line", ["\nmore\nthird\nfo", "\nmore\nthird\nfou"]],
    ["several pasted lines", ["\nmore\nthird\nfourth"]],
    ["a line taken away", ["\nmore\nthird", "\nmore"]],
  ])(
    "draws %s as a full render would",
    { timeout: 120_000 },
    async (_case, steps) => {
      const { doc, page } = await buildScan(
        [
          {
            family: "Carlito",
            text: "Invoice 4471 for Jane Example",
            size: 12,
          },
        ],
        { dpi: 200, blur: 0.5, noise: 6 },
        260,
      );
      const store = new EditorStore();
      stores.push(store);
      await store.setDocument(doc);
      const run = page.runs.find(isScanRun)!;
      while (!prefitScanRun(doc, page, run, performance.now() + 50))
        await new Promise((resolve) => setTimeout(resolve, 0));
      const base = run.text;
      const edit = (suffix: string) =>
        store.dispatch(
          new EditTextCommand({
            pageIndex: 0,
            runId: run.id,
            nextText: base + suffix,
          }),
        );
      steps.slice(0, -1).forEach(edit);
      const painted = page.revision;
      const canvas = await PdfiumPageRenderer.render(doc, page, SCALE);

      edit(steps[steps.length - 1]);
      const raw = page.repaintAreaSince(painted);
      const area = raw && PdfiumPageRenderer.pixelsCovering(page, SCALE, raw);
      if (area)
        paste(
          canvas,
          await PdfiumPageRenderer.renderArea(doc, page, SCALE, area),
          area.x,
          area.y,
        );

      const full = await PdfiumPageRenderer.render(doc, page, SCALE);
      expect(differingPixels(full, canvas)).toBe(0);
    },
  );
});
