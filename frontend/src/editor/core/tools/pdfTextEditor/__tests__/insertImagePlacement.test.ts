// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import {
  centredImageRect,
  InsertImageCommand,
} from "@editor/tools/pdfTextEditor/commands/InsertImageCommand";
import { SetImageTransformCommand } from "@editor/tools/pdfTextEditor/commands/SetImageTransformCommand";
import { imageMatrixBounds } from "@editor/tools/pdfTextEditor/model/affine";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const RATIO = 0.4;
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

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  return doc;
}

async function openFixture(name: string): Promise<EditorDocument> {
  return open(new Uint8Array(await readFile(path.join(FIXTURES, name))));
}

function solid(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;
    rgba[i + 3] = 255;
  }
  return rgba;
}

function insert(page: Page, pixelWidth: number, pixelHeight: number) {
  return new InsertImageCommand({
    pageIndex: page.index,
    rgba: solid(pixelWidth, pixelHeight),
    pixelWidth,
    pixelHeight,
    ...centredImageRect(page.display.toData(), pixelWidth, pixelHeight, RATIO),
  });
}

function onScreen(page: Page, raw: PageRect): PageRect {
  const corners = [
    page.display.apply(raw.x, raw.y),
    page.display.apply(raw.x + raw.width, raw.y + raw.height),
  ];
  const x = Math.min(...corners.map((c) => c.x));
  const y = Math.min(...corners.map((c) => c.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((c) => c.x)) - x,
    height: Math.max(...corners.map((c) => c.y)) - y,
  };
}

function expectCentredUpright(page: Page, raw: PageRect, aspect: number): void {
  const shown = onScreen(page, raw);
  const { displayWidth, displayHeight } = page.display;
  expect(shown.x + shown.width / 2).toBeCloseTo(displayWidth / 2, 3);
  expect(shown.y + shown.height / 2).toBeCloseTo(displayHeight / 2, 3);
  expect(shown.x).toBeGreaterThanOrEqual(-1e-3);
  expect(shown.y).toBeGreaterThanOrEqual(-1e-3);
  expect(shown.x + shown.width).toBeLessThanOrEqual(displayWidth + 1e-3);
  expect(shown.y + shown.height).toBeLessThanOrEqual(displayHeight + 1e-3);
  expect(shown.height / shown.width).toBeCloseTo(aspect, 3);
}

const CASES = [
  ["rotated-pages.pdf", 0, 0],
  ["rotated-pages.pdf", 1, 90],
  ["rotated-pages.pdf", 2, 270],
  ["rotated-pages.pdf", 3, 180],
  ["cropbox-rotate90.pdf", 0, 90],
  ["cropbox-offset.pdf", 0, 0],
] as const;

test.each(CASES)(
  "a new image on %s page %i (/Rotate %i) is centred upright on the visible page, on screen and saved",
  async (fixture, pageIndex, _rotation) => {
    const doc = await openFixture(fixture);
    const page = doc.page(pageIndex);
    const history = new HistoryStack();
    const cmd = insert(page, 50, 100);
    history.execute(cmd, doc);
    const image = page.images.find((i) => i.id === cmd.insertedImageId)!;
    expectCentredUpright(page, image.bounds, 2);

    const saved = await open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    const savedPage = saved.page(pageIndex);
    PdfiumTextReader.populate(saved, savedPage);
    const savedImage = savedPage.images.at(-1)!;
    expectCentredUpright(savedPage, imageMatrixBounds(savedImage.matrix), 2);
  },
);

test.each(CASES)(
  "an image too tall for %s page %i (/Rotate %i) is shrunk to fit the visible page",
  async (fixture, pageIndex, _rotation) => {
    const doc = await openFixture(fixture);
    const page = doc.page(pageIndex);
    const cmd = insert(page, 10, 400);
    new HistoryStack().execute(cmd, doc);
    const image = page.images.find((i) => i.id === cmd.insertedImageId)!;
    expectCentredUpright(page, image.bounds, 40);
    expect(onScreen(page, image.bounds).height).toBeCloseTo(
      page.display.displayHeight,
      3,
    );
  },
);

test.each([
  ["rotated-pages.pdf", 1, 90],
  ["rotated-pages.pdf", 2, 270],
  ["cropbox-rotate90.pdf", 0, 90],
] as const)(
  "redo on %s page %i (/Rotate %i) restores the bounds the first insert gave, and a resize after it keeps the picture",
  async (fixture, pageIndex, _rotation) => {
    const doc = await openFixture(fixture);
    const page = doc.page(pageIndex);
    const history = new HistoryStack();
    const cmd = insert(page, 50, 100);
    history.execute(cmd, doc);
    const id = cmd.insertedImageId!;
    const first = page.findImage(id)!;
    const applied = {
      bounds: { ...first.bounds },
      matrix: { ...first.matrix },
    };

    history.undo(doc);
    expect(page.findImage(id)).toBeFalsy();
    history.redo(doc);
    const redone = page.findImage(id)!;
    expect(redone.bounds).toEqual(applied.bounds);
    expect(redone.matrix).toEqual(applied.matrix);
    expect(redone.bounds).toEqual(imageMatrixBounds(redone.matrix));

    const grown: PageRect = {
      x: applied.bounds.x - applied.bounds.width / 2,
      y: applied.bounds.y - applied.bounds.height / 2,
      width: applied.bounds.width * 2,
      height: applied.bounds.height * 2,
    };
    history.execute(
      new SetImageTransformCommand({
        pageIndex,
        imageId: id,
        nextBounds: grown,
      }),
      doc,
    );
    const resized = page.findImage(id)!;
    const matrix = resized.matrix;
    expect(resized.bounds.x).toBeCloseTo(grown.x, 3);
    expect(resized.bounds.y).toBeCloseTo(grown.y, 3);
    expect(resized.bounds.width).toBeCloseTo(grown.width, 3);
    expect(resized.bounds.height).toBeCloseTo(grown.height, 3);
    expect(
      Math.hypot(matrix.a, matrix.b) / Math.hypot(matrix.c, matrix.d),
    ).toBeCloseTo(
      Math.hypot(applied.matrix.a, applied.matrix.b) /
        Math.hypot(applied.matrix.c, applied.matrix.d),
      3,
    );
    const shown = onScreen(page, resized.bounds);
    expect(shown.x + shown.width / 2).toBeCloseTo(
      page.display.displayWidth / 2,
      3,
    );
    expect(shown.y + shown.height / 2).toBeCloseTo(
      page.display.displayHeight / 2,
      3,
    );
    expect(shown.height / shown.width).toBeCloseTo(2, 3);
  },
);
