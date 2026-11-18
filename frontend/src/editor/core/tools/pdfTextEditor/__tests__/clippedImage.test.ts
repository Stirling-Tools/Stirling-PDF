// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { DeleteImageCommand } from "@editor/tools/pdfTextEditor/commands/DeleteImageCommand";
import { ReplaceImageCommand } from "@editor/tools/pdfTextEditor/commands/ReplaceImageCommand";
import { SetImageTransformCommand } from "@editor/tools/pdfTextEditor/commands/SetImageTransformCommand";
import { TransformImageObjectCommand } from "@editor/tools/pdfTextEditor/commands/TransformImageObjectCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  HistoryStack,
  HistoryStepError,
} from "@editor/tools/pdfTextEditor/store/HistoryStack";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  imageBoundsForVisible,
  visibleImageBounds,
} from "@editor/tools/pdfTextEditor/util/imageClip";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import {
  changedPixels,
  rasterFirstPage,
} from "@editor/tools/pdfTextEditor/__tests__/pageRaster";

const SIZE = 300;
const BLUE_2X2 = streamBody(
  "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8",
  "\x00\x00\xff".repeat(4),
);
const IMAGE = "200 0 0 200 50 50 cm /Im Do";
const WINDOW: PageRect = { x: 100, y: 100, width: 100, height: 100 };

function fixture(page: string, form = ""): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SIZE} ${SIZE}] /Contents 4 0 R /Resources << /XObject << /Im 5 0 R /Fm 6 0 R >> /Font << /F1 7 0 R >> >> >>`,
      },
      { num: 4, body: streamBody("", page) },
      { num: 5, body: BLUE_2X2 },
      {
        num: 6,
        body: streamBody(
          `/Type /XObject /Subtype /Form /BBox [0 0 ${SIZE} ${SIZE}] /Resources << /XObject << /Im 5 0 R >> >>`,
          form,
        ),
      },
      {
        num: 7,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
    ],
    1,
  );
}

const SQUARE_CLIP = "100 100 100 100 re W n";
const CASES: Array<[string, Uint8Array]> = [
  ["a page-level rectangular clip", fixture(`q ${SQUARE_CLIP} ${IMAGE} Q`)],
  [
    "a page-level triangular clip",
    fixture(`q 100 100 m 200 100 l 150 200 l h W n ${IMAGE} Q`),
  ],
  ["a clip inside the form", fixture("/Fm Do", `q ${SQUARE_CLIP} ${IMAGE} Q`)],
  [
    "nested clips beside text, as Word prints a cropped picture",
    fixture(
      `q 0 0 300 300 re W n BT /F1 12 Tf 20 250 Td (Caption) Tj ET q ${SQUARE_CLIP} q ${IMAGE} Q Q Q`,
    ),
  ],
];

const opened: EditorDocument[] = [];

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

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

async function reopened(doc: EditorDocument): Promise<EditorDocument> {
  return open(new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()));
}

const raster = (doc: EditorDocument) => rasterFirstPage(doc, SIZE, SIZE);

// Page-space box around the blue the page shows, or null when none shows.
function blueBox(pixels: Uint8Array): PageRect | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const i = (row * SIZE + col) * 4;
      if (pixels[i] > 80 || pixels[i + 1] > 80 || pixels[i + 2] < 200) continue;
      const y = SIZE - 1 - row;
      [x0, y0, x1, y1] = [
        Math.min(x0, col),
        Math.min(y0, y),
        Math.max(x1, col + 1),
        Math.max(y1, y + 1),
      ];
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function image(doc: EditorDocument) {
  return doc.page(0).images[0];
}

function expectRect(actual: PageRect | null, expected: PageRect): void {
  expect(actual).not.toBeNull();
  for (const key of ["x", "y", "width", "height"] as const)
    expect(Math.abs(actual![key] - expected[key])).toBeLessThanOrEqual(1);
}

function moveWindowTo(doc: EditorDocument, next: PageRect): Command {
  const img = image(doc);
  return new SetImageTransformCommand({
    pageIndex: 0,
    imageId: img.id,
    nextBounds: imageBoundsForVisible(img, next),
  });
}

async function expectEditKeepsWindow(
  bytes: Uint8Array,
  edit: (doc: EditorDocument) => Command,
  window: PageRect,
): Promise<void> {
  const doc = await open(bytes);
  const before = raster(doc);
  const shownBefore = blueBox(before);
  const history = new HistoryStack();
  history.execute(edit(doc), doc);
  const after = raster(doc);
  expectRect(blueBox(after), window);
  expectRect(visibleImageBounds(image(doc)), window);
  const saved = await reopened(doc);
  expect(changedPixels(after, raster(saved))).toBe(0);
  expectRect(visibleImageBounds(image(saved)), window);
  history.undo(doc);
  expect(changedPixels(before, raster(doc))).toBe(0);
  expectRect(blueBox(raster(doc)), shownBefore!);
  history.redo(doc);
  expect(changedPixels(after, raster(doc))).toBe(0);
  history.undo(doc);
  expect(changedPixels(before, raster(await reopened(doc)))).toBe(0);
}

describe.each(CASES)("an image cropped by %s", (_name, bytes) => {
  test("is selected by the window it shows, not the hidden image", async () => {
    const doc = await open(bytes);
    expectRect(image(doc).bounds, { x: 50, y: 50, width: 200, height: 200 });
    expectRect(visibleImageBounds(image(doc)), WINDOW);
  });

  test("moving the window moves the crop with it", async () => {
    await expectEditKeepsWindow(
      bytes,
      (doc) => moveWindowTo(doc, { ...WINDOW, x: 140, y: 80 }),
      { ...WINDOW, x: 140, y: 80 },
    );
  });

  test("resizing the window scales the crop with it", async () => {
    const half = { x: 100, y: 100, width: 50, height: 50 };
    await expectEditKeepsWindow(bytes, (doc) => moveWindowTo(doc, half), half);
  });

  test("replacing it is refused rather than showing the hidden part", async () => {
    const doc = await open(bytes);
    const before = raster(doc);
    const history = new HistoryStack();
    const replace = new ReplaceImageCommand({
      pageIndex: 0,
      imageId: image(doc).id,
      image: {
        width: 2,
        height: 2,
        rgba: new Uint8Array(16).map((_, i) => [0, 200, 0, 255][i % 4]),
      },
    });
    let refusal: unknown = null;
    try {
      history.execute(replace, doc);
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeInstanceOf(HistoryStepError);
    expect((refusal as HistoryStepError).documentIntact).toBe(true);
    expect(history.canUndo).toBe(false);
    expect(changedPixels(before, raster(doc))).toBe(0);
    expect(changedPixels(before, raster(await reopened(doc)))).toBe(0);
  });

  test("deleting it and undoing restores the window exactly", async () => {
    const doc = await open(bytes);
    const before = raster(doc);
    const history = new HistoryStack();
    history.execute(
      new DeleteImageCommand({ pageIndex: 0, imageId: image(doc).id }),
      doc,
    );
    expect(blueBox(raster(doc))).toBeNull();
    history.undo(doc);
    expect(changedPixels(before, raster(doc))).toBe(0);
    expectRect(visibleImageBounds(image(doc)), WINDOW);
  });
});

describe("an image cropped off-centre", () => {
  const offCentre = fixture(`q 60 60 80 80 re W n ${IMAGE} Q`);
  const window = { x: 60, y: 60, width: 80, height: 80 };

  test("turns in place about the window it shows", async () => {
    await expectEditKeepsWindow(
      offCentre,
      (doc) =>
        new TransformImageObjectCommand({
          pageIndex: 0,
          imageId: image(doc).id,
          mode: "rotate-cw",
        }),
      window,
    );
  });

  test("flips in place about the window it shows", async () => {
    await expectEditKeepsWindow(
      offCentre,
      (doc) =>
        new TransformImageObjectCommand({
          pageIndex: 0,
          imageId: image(doc).id,
          mode: "flip-h",
        }),
      window,
    );
  });
});

describe("an image drawn by a form through the form's own clip", () => {
  const formClipped = fixture(`q ${SQUARE_CLIP} /Fm Do Q`, IMAGE);

  test("is selected by the window it shows", async () => {
    const doc = await open(formClipped);
    expectRect(visibleImageBounds(image(doc)), WINDOW);
  });

  test("moving it is refused, leaving the page as it was", async () => {
    const doc = await open(formClipped);
    const before = raster(doc);
    const history = new HistoryStack();
    expect(() =>
      history.execute(moveWindowTo(doc, { ...WINDOW, x: 140 }), doc),
    ).toThrow(HistoryStepError);
    expect(changedPixels(before, raster(doc))).toBe(0);
    expect(changedPixels(before, raster(await reopened(doc)))).toBe(0);
  });
});
