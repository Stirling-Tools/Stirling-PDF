// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumPageRenderer } from "@editor/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { visibleImageBounds } from "@editor/tools/pdfTextEditor/util/imageClip";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const SIZE = 300;
const SCALE = 1;
const IMAGE = streamBody(
  "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8",
  "\x00\x00\xff".repeat(4),
);
const UNDER =
  "0.9 0.6 0.1 rg 60 60 180 40 re f BT /F1 14 Tf 0 0 0 rg 70 120 Td (Under the picture) Tj ET";
const OVER = "BT /F1 14 Tf 1 0 0 rg 70 170 Td (Over it) Tj ET";
const ELSEWHERE = "BT /F1 12 Tf 0 0 0 rg 20 270 Td (Elsewhere) Tj ET";

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
      { num: 5, body: IMAGE },
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

const DRAW = "q 50 50 200 150 re W n 200 0 0 200 50 50 cm /Im Do Q";
const CASES: Array<[string, Uint8Array, Uint8Array]> = [
  [
    "on the page, between text under and over it",
    fixture(`${ELSEWHERE} ${UNDER} ${DRAW} ${OVER}`),
    fixture(`${ELSEWHERE} ${UNDER} ${OVER}`),
  ],
  [
    "inside a form",
    fixture(`${ELSEWHERE} ${UNDER} /Fm Do ${OVER}`, DRAW),
    fixture(`${ELSEWHERE} ${UNDER} /Fm Do ${OVER}`),
  ],
];

const opened: EditorDocument[] = [];

class TestImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal("ImageData", TestImageData);
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

async function render(doc: EditorDocument): Promise<Uint8ClampedArray> {
  return (await PdfiumPageRenderer.render(doc, doc.page(0), SCALE)).data;
}

function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4)
    if ([0, 1, 2].some((c) => Math.abs(a[i + c] - b[i + c]) > 2)) n++;
  return n;
}

async function saved(doc: EditorDocument): Promise<Uint8Array> {
  return new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
}

function hideImage(doc: EditorDocument): ImageData {
  const page = doc.page(0);
  const image = page.images[0];
  const area = PdfiumPageRenderer.pixelsCovering(
    page,
    SCALE,
    visibleImageBounds(image),
  )!;
  return PdfiumPageRenderer.renderAreaWithout(
    doc,
    page,
    SCALE,
    area,
    image.pdfiumObjPtr,
  )!;
}

function moveElsewhere(doc: EditorDocument): MoveTextRunCommand {
  const run = doc.page(0).runs.find((r) => r.text.startsWith("Elsewhere"))!;
  return new MoveTextRunCommand({ pageIndex: 0, runId: run.id, dx: 30, dy: 0 });
}

describe.each(CASES)("an image %s", (_name, bytes, withoutImage) => {
  test("renders the page under it as it would be without the image", async () => {
    const doc = await open(bytes);
    const page = doc.page(0);
    const area = PdfiumPageRenderer.pixelsCovering(
      page,
      SCALE,
      visibleImageBounds(page.images[0]),
    )!;
    const hidden = hideImage(doc);
    const expected = await PdfiumPageRenderer.renderArea(
      await open(withoutImage),
      opened.at(-1)!.page(0),
      SCALE,
      area,
    );
    expect(differing(hidden.data, expected.data)).toBe(0);
  });

  test("leaves the document, its history and its saved file untouched", async () => {
    const doc = await open(bytes);
    const page = doc.page(0);
    const revision = page.revision;
    const before = await render(doc);
    hideImage(doc);
    expect(page.dirty).toBe(false);
    expect(page.revision).toBe(revision);
    expect(differing(before, await render(doc))).toBe(0);
    expect(differing(before, await render(await open(await saved(doc))))).toBe(
      0,
    );
    const history = new HistoryStack();
    history.execute(moveElsewhere(doc), doc);
    const moved = await render(doc);
    expect(differing(before, moved)).toBeGreaterThan(0);
    expect(differing(moved, await render(await open(await saved(doc))))).toBe(
      0,
    );
    history.undo(doc);
    expect(differing(before, await render(doc))).toBe(0);
    expect(differing(before, await render(await open(await saved(doc))))).toBe(
      0,
    );
  });
});
