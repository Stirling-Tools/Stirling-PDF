// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { DeleteImageCommand } from "@editor/tools/pdfTextEditor/commands/DeleteImageCommand";
import { DeleteShapeCommand } from "@editor/tools/pdfTextEditor/commands/DeleteShapeCommand";
import { SetImageTransformCommand } from "@editor/tools/pdfTextEditor/commands/SetImageTransformCommand";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

// The form draws at a quarter of its own scale, as design tools export labels.
const FORM_SCALE = 0.25;
const FORM_X = 72;
const SAVED_X = 72.468;

function scaledFormPdf(): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /XObject << /Fm1 5 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody(
          "",
          `q ${FORM_SCALE} 0 0 ${FORM_SCALE} ${FORM_X} 700 cm /Fm1 Do Q\n`,
        ),
      },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 2000 400] " +
            "/Resources << /Font << /F1 6 0 R >> >>",
          "BT /F1 48 Tf 0 100 Td (Open Source) Tj ET\n",
        ),
      },
      {
        num: 6,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
    ],
    1,
  );
}

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

function leftEdge(doc: EditorDocument, ptr: number): number {
  const m = doc.module;
  const box = m.pdfium.wasmExports.malloc(16);
  try {
    m.FPDFPageObj_GetBounds(ptr, box, box + 4, box + 8, box + 12);
    return m.pdfium.getValue(box, "float");
  } finally {
    m.pdfium.wasmExports.free(box);
  }
}

// The same label one form deeper: the page draws a half-scale form that draws the label's form at half scale again.
function nestedFormPdf(): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /XObject << /Fm0 7 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody("", `q 0.5 0 0 0.5 ${FORM_X} 700 cm /Fm0 Do Q\n`),
      },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 2000 400] " +
            "/Resources << /Font << /F1 6 0 R >> >>",
          "BT /F1 48 Tf 0 100 Td (Open Source) Tj ET\n",
        ),
      },
      {
        num: 6,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      {
        num: 7,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 4000 800] " +
            "/Resources << /XObject << /Fm1 5 0 R >> >>",
          "q 0.5 0 0 0.5 0 0 cm /Fm1 Do Q\n",
        ),
      },
    ],
    1,
  );
}

async function openForm(bytes: Uint8Array = scaledFormPdf()) {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  const run = doc.page(0).runs.find((r) => r.text.includes("Open"))!;
  return { doc, run };
}

async function saved(doc: EditorDocument) {
  const { doc: reopened } = await openForm(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  return reopened.page(0).runs;
}

const RED = { r: 220, g: 0, b: 0, a: 255 };

describe("text drawn inside a form", () => {
  test.each<
    [
      string,
      (id: string) => Command,
      (run: {
        bounds: { x: number };
        fill: { r: number };
        fontSize: number;
      }) => void,
    ]
  >([
    [
      "a move",
      (runId) => new MoveTextRunCommand({ pageIndex: 0, runId, dx: 50, dy: 0 }),
      (run) => expect(run.bounds.x).toBeCloseTo(SAVED_X + 50, 1),
    ],
    [
      "a colour",
      (runId) => new SetColourCommand({ pageIndex: 0, runId, nextFill: RED }),
      (run) => {
        expect(run.fill.r).toBe(220);
        expect(run.bounds.x).toBeCloseTo(SAVED_X, 1);
      },
    ],
    [
      "a size",
      (runId) => new SetFontSizeCommand({ pageIndex: 0, runId, nextSize: 24 }),
      (run) => expect(run.fontSize).toBeCloseTo(24, 1),
    ],
  ])("keeps %s in the saved file", async (_edit, command, check) => {
    const { doc, run } = await openForm();

    command(run.id).apply(doc);

    const [reopened, ...rest] = await saved(doc);
    expect(rest).toHaveLength(0);
    expect(reopened.text).toBe("Open Source");
    check(reopened);
  });

  test.each([
    ["a form", scaledFormPdf],
    ["a form inside a form", nestedFormPdf],
  ])("typed before it saves as one line, in %s", async (_case, pdf) => {
    const { doc, run } = await openForm(pdf());
    const left = run.bounds.x;

    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: "Xk " + run.text,
    }).apply(doc);

    const [reopened, ...rest] = await saved(doc);
    expect(rest).toHaveLength(0);
    expect(reopened.text).toBe("Xk Open Source");
    expect(reopened.bounds.x).toBeCloseTo(left, 0);
  });

  test.each([
    [
      "typing",
      (id: string) =>
        new EditTextCommand({
          pageIndex: 0,
          runId: id,
          nextText: "Xk Open Source",
        }),
    ],
    [
      "a delete",
      (id: string) => new DeleteObjectCommand({ pageIndex: 0, runId: id }),
    ],
    [
      "a move",
      (id: string) =>
        new MoveTextRunCommand({ pageIndex: 0, runId: id, dx: 50, dy: 0 }),
    ],
  ])(
    "undo of %s puts it back where it was, on the page and in the saved file",
    async (_edit, command) => {
      const { doc, run } = await openForm();
      const label = run.mergedFromPtrs[0] || run.pdfiumObjPtr;
      const edit = command(run.id);

      edit.apply(doc);
      edit.revert(doc);

      expect(leftEdge(doc, label)).toBeCloseTo(SAVED_X, 1);
      const [reopened, ...rest] = await saved(doc);
      expect(rest).toHaveLength(0);
      expect(reopened.text).toBe("Open Source");
      expect(reopened.bounds.x).toBeCloseTo(SAVED_X, 1);
    },
  );

  test("undo of a typing burst puts it back where it was, however often it is redone", async () => {
    const { doc, run } = await openForm();
    const label = run.mergedFromPtrs[0] || run.pdfiumObjPtr;
    const history = new HistoryStack();
    for (const prefix of ["X ", "XY "])
      history.execute(
        new EditTextCommand({
          pageIndex: 0,
          runId: run.id,
          nextText: prefix + "Open Source",
        }),
        doc,
      );
    expect(history.size().undo).toBe(1);
    history.undo(doc);
    history.redo(doc);
    const redone = leftEdge(doc, label);

    for (let i = 0; i < 20; i++) {
      history.undo(doc);
      history.redo(doc);
    }
    expect(leftEdge(doc, label)).toBeCloseTo(redone, 3);
    history.undo(doc);

    expect(leftEdge(doc, label)).toBeCloseTo(SAVED_X, 1);
    expect(run.text).toBe("Open Source");
  });
});

// A red 100pt square drawn by a quarter-scale form.
function formImagePdf(): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /XObject << /Fm1 5 0 R >> >> >>",
      },
      {
        num: 4,
        body: streamBody(
          "",
          `q ${FORM_SCALE} 0 0 ${FORM_SCALE} ${FORM_X} 500 cm /Fm1 Do Q\n`,
        ),
      },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 2000 2000] " +
            "/Resources << /XObject << /Im1 6 0 R >> >>",
          "q 400 0 0 400 0 0 cm /Im1 Do Q\n",
        ),
      },
      {
        num: 6,
        body: streamBody(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 " +
            "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode",
          "FF0000>",
        ),
      },
    ],
    1,
  );
}

describe("an image drawn inside a form", () => {
  async function openImage(bytes: Uint8Array = formImagePdf()) {
    const doc = await EditorDocument.open(bytes);
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    return { doc, images: doc.page(0).images };
  }
  async function savedImages(doc: EditorDocument) {
    const { images } = await openImage(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    return images;
  }

  test("is gone from the saved file once deleted, and back in place after undo", async () => {
    const { doc, images } = await openImage();
    const [image] = images;
    const box = { ...image.bounds };
    const remove = new DeleteImageCommand({ pageIndex: 0, imageId: image.id });

    remove.apply(doc);
    expect(await savedImages(doc)).toHaveLength(0);

    remove.revert(doc);
    const [back, ...rest] = await savedImages(doc);
    expect(rest).toHaveLength(0);
    expect(back.bounds.x).toBeCloseTo(box.x, 1);
    expect(back.bounds.width).toBeCloseTo(box.width, 1);
  });

  test("keeps a move in the saved file", async () => {
    const { doc, images } = await openImage();
    const [image] = images;
    const nextBounds = { ...image.bounds, x: image.bounds.x + 60 };

    new SetImageTransformCommand({
      pageIndex: 0,
      imageId: image.id,
      nextBounds,
    }).apply(doc);

    const [moved, ...rest] = await savedImages(doc);
    expect(rest).toHaveLength(0);
    expect(moved.bounds.x).toBeCloseTo(nextBounds.x, 1);
    expect(moved.bounds.width).toBeCloseTo(nextBounds.width, 1);
  });
});

// One form drawn twice on the first page and once on the second, holding two lines.
function sharedFormPdf(): Uint8Array {
  const draw = (y: number) =>
    `q ${FORM_SCALE} 0 0 ${FORM_SCALE} ${FORM_X} ${y} cm /Fm1 Do Q\n`;
  const page = (contents: number) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R ` +
    "/Resources << /XObject << /Fm1 5 0 R >> >> >>";
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R 7 0 R] /Count 2 >>" },
      { num: 3, body: page(4) },
      { num: 4, body: streamBody("", draw(700) + draw(400)) },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 2000 400] " +
            "/Resources << /Font << /F1 6 0 R >> >>",
          "BT /F1 48 Tf 0 100 Td (Open Source) Tj ET\n" +
            "BT /F1 48 Tf 0 -100 Td (Second label) Tj ET\n",
        ),
      },
      {
        num: 6,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      { num: 7, body: page(8) },
      { num: 8, body: streamBody("", draw(700)) },
    ],
    1,
  );
}

describe("a form drawn more than once", () => {
  async function texts(doc: EditorDocument, pageIndex: number) {
    const page = doc.page(pageIndex);
    PdfiumTextReader.populate(doc, page);
    return page.runs
      .map((r) => `${r.text.trim()}@${Math.round(r.bounds.y)}`)
      .sort();
  }

  test("keeps its text everywhere else when one copy is edited", async () => {
    const doc = await EditorDocument.open(sharedFormPdf());
    opened.push(doc);
    const firstPage = await texts(doc, 0);
    const secondPage = await texts(doc, 1);
    const edited = doc
      .page(0)
      .runs.find((r) => r.text.includes("Open") && r.bounds.y > 600)!;

    new SetColourCommand({
      pageIndex: 0,
      runId: edited.id,
      nextFill: RED,
    }).apply(doc);

    const saved = await EditorDocument.open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    opened.push(saved);
    expect(await texts(saved, 0)).toEqual(firstPage);
    expect(await texts(saved, 1)).toEqual(secondPage);
    const reds = saved.page(0).runs.filter((r) => r.fill.r === 220);
    expect(reds.map((r) => r.text.trim())).toEqual(["Open Source"]);
  });

  test("leaves the other line of the edited copy in place and editable", async () => {
    const doc = await EditorDocument.open(sharedFormPdf());
    opened.push(doc);
    const before = await texts(doc, 0);
    const page = doc.page(0);
    const first = page.runs.find(
      (r) => r.text.includes("Open") && r.bounds.y > 600,
    )!;
    const second = page.runs.find(
      (r) => r.text.includes("Second") && r.bounds.y > 600,
    )!;

    const was = `Second label@${Math.round(second.bounds.y)}`;

    new SetColourCommand({
      pageIndex: 0,
      runId: first.id,
      nextFill: RED,
    }).apply(doc);
    expect(second.containerPtr).toBe(0);
    new MoveTextRunCommand({
      pageIndex: 0,
      runId: second.id,
      dx: 0,
      dy: -20,
    }).apply(doc);

    const saved = await EditorDocument.open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    opened.push(saved);
    const moved = `Second label@${Math.round(second.bounds.y)}`;
    expect(await texts(saved, 0)).toEqual(
      before.map((line) => (line === was ? moved : line)).sort(),
    );
  });
});

// One form holding a filled panel, drawn twice on the first page and once on the second.
function sharedPanelFormPdf(): Uint8Array {
  const draw = (y: number) => `q 1 0 0 1 ${FORM_X} ${y} cm /Fm1 Do Q\n`;
  const page = (contents: number) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R ` +
    "/Resources << /XObject << /Fm1 5 0 R >> >> >>";
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R 7 0 R] /Count 2 >>" },
      { num: 3, body: page(4) },
      { num: 4, body: streamBody("", draw(600) + draw(300)) },
      {
        num: 5,
        body: streamBody(
          "/Type /XObject /Subtype /Form /BBox [0 0 400 120] " +
            "/Resources << /Font << /F1 6 0 R >> >>",
          "1 0.9 0.2 rg 0 0 300 100 re f\n" +
            "0 g BT /F1 12 Tf 10 40 Td (Panel label) Tj ET\n",
        ),
      },
      {
        num: 6,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      { num: 7, body: page(8) },
      { num: 8, body: streamBody("", draw(600)) },
    ],
    1,
  );
}

describe("a shape in a form drawn more than once", () => {
  function panels(doc: EditorDocument, pageIndex: number): number[] {
    const page = doc.page(pageIndex);
    if (!page.loaded) PdfiumTextReader.populate(doc, page);
    return page.shapes.map((s) => Math.round(s.bounds.y)).sort();
  }

  async function savedPanels(doc: EditorDocument) {
    const reopened = await EditorDocument.open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    opened.push(reopened);
    return [panels(reopened, 0), panels(reopened, 1)];
  }

  async function deleteUpperPanel() {
    const doc = await EditorDocument.open(sharedPanelFormPdf());
    opened.push(doc);
    panels(doc, 0);
    panels(doc, 1);
    const upper = doc.page(0).shapes.find((s) => s.bounds.y > 500)!;
    const history = new HistoryStack();
    history.execute(
      new DeleteShapeCommand({ pageIndex: 0, shapeId: upper.id }),
      doc,
    );
    return { doc, history };
  }

  test("is deleted from the copy it was picked in and nowhere else", async () => {
    const { doc, history } = await deleteUpperPanel();

    expect(panels(doc, 0)).toEqual([300]);
    expect(await savedPanels(doc)).toEqual([[300], [600]]);

    history.undo(doc);
    expect(panels(doc, 0)).toEqual([300, 600]);
    expect(await savedPanels(doc)).toEqual([[300, 600], [600]]);

    history.redo(doc);
    expect(await savedPanels(doc)).toEqual([[300], [600]]);
    expect(await savedPanels(doc)).toEqual([[300], [600]]);
  });

  test("keeps the text of the copy it was deleted from", async () => {
    const { doc } = await deleteUpperPanel();

    const reopened = await saved(doc);
    expect(
      reopened
        .filter((r) => r.text.includes("Panel"))
        .map((r) => Math.round(r.bounds.y / 100)),
    ).toEqual(expect.arrayContaining([6, 3]));
  });
});
