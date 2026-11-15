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
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const SCALE = 1.37;

class TestImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

const stores: EditorStore[] = [];

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal("ImageData", TestImageData);
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

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

async function open(fixture: string) {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(path.join(FIXTURES, fixture))),
  );
  const store = new EditorStore();
  stores.push(store);
  await store.setDocument(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  return { doc, page, store };
}

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

describe("redrawing only the edited area", () => {
  test.each([
    ["a cropped page", "cropbox-offset.pdf", ["Hi there, Wj"]],
    [
      "a cropped page turned a quarter",
      "cropbox-rotate90.pdf",
      ["Hi there, Wj"],
    ],
    ["a line broken in three", "cropbox-offset.pdf", ["Hi\nthere\nWj"]],
    [
      "the last of three lines",
      "cropbox-offset.pdf",
      ["Hi\nthere\nWj", "Hi\nthere\nWj Qy"],
    ],
  ])("draws %s as a full render would", async (_case, fixture, texts) => {
    const { doc, page, store } = await open(fixture);
    const run = page.runs.find((r) => r.text === "Hi")!;
    const edit = (nextText: string) =>
      store.dispatch(
        new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
      );
    texts.slice(0, -1).forEach(edit);
    const painted = page.revision;
    const canvas = await PdfiumPageRenderer.render(doc, page, SCALE);

    edit(texts[texts.length - 1]);
    const area = PdfiumPageRenderer.pixelsCovering(
      page,
      SCALE,
      page.repaintAreaSince(painted)!,
    )!;
    paste(
      canvas,
      await PdfiumPageRenderer.renderArea(doc, page, SCALE, area),
      area.x,
      area.y,
    );

    const full = await PdfiumPageRenderer.render(doc, page, SCALE);
    expect(differingPixels(full, canvas)).toBe(0);
    expect(differingPixels(full, await rendered(fixture))).toBeGreaterThan(0);
    expect(area.width * area.height).toBeLessThan(
      (full.width * full.height) / 2,
    );
  });
});

async function rendered(fixture: string): Promise<ImageData> {
  const { doc, page } = await open(fixture);
  return PdfiumPageRenderer.render(doc, page, SCALE);
}
