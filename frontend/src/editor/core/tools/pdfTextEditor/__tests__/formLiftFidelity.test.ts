// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { DeleteShapeCommand } from "@editor/tools/pdfTextEditor/commands/DeleteShapeCommand";
import { MergeRunsCommand } from "@editor/tools/pdfTextEditor/commands/MergeRunsCommand";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  HistoryStack,
  HistoryStepError,
} from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { toLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import {
  changedPixels,
  rasterFirstPage,
} from "@editor/tools/pdfTextEditor/__tests__/pageRaster";

const SIZE = 300;
const RED = { r: 255, g: 0, b: 0, a: 255 };
const FONT = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
const TEXT = "0 0 0 rg BT /F1 14 Tf 20 50 Td (Trustworthy document) Tj ET";

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

interface FixtureParts {
  /** Page content; the form is `/Fm`. */
  page: string;
  /** Extra entries for the page's /Resources. */
  pageResources?: string;
  /** The form's content, drawn after a grey panel. */
  form?: string;
  /** Extra entries for the form's /Resources. */
  formResources?: string;
  /** Objects 8 and up, referenced by the parts above. */
  extra?: string[];
}

function fixture(parts: FixtureParts): Uint8Array {
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SIZE} ${SIZE}] /Contents 4 0 R /Resources << /XObject << /Fm 5 0 R >> ${parts.pageResources ?? ""} >> >>`,
      },
      {
        num: 4,
        body: streamBody("", `1 0 0 rg 0 0 300 300 re f ${parts.page}`),
      },
      {
        num: 5,
        body: streamBody(
          `/Type /XObject /Subtype /Form /BBox [0 0 200 100] /Resources << /Font << /F1 6 0 R >> ${parts.formResources ?? ""} >>`,
          `0.8 0.8 0.8 rg 0 0 200 100 re f ${parts.form ?? ""} ${TEXT}`,
        ),
      },
      { num: 6, body: FONT },
      ...(parts.extra ?? []).map((body, i) => ({ num: 8 + i, body })),
    ],
    1,
  );
}

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

const raster = (doc: EditorDocument) => rasterFirstPage(doc, SIZE, SIZE);

async function saved(doc: EditorDocument): Promise<Uint8Array> {
  return new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
}

function recolour(doc: EditorDocument): SetColourCommand {
  const run = doc
    .page(0)
    .runs.find((r) => r.text.startsWith("Trustworthy document"))!;
  return new SetColourCommand({ pageIndex: 0, runId: run.id, nextFill: RED });
}

async function expectLiftedFaithfully(bytes: Uint8Array): Promise<void> {
  const doc = await open(bytes);
  const before = raster(doc);
  const history = new HistoryStack();
  history.execute(recolour(doc), doc);
  history.undo(doc);
  expect(changedPixels(before, raster(doc))).toBe(0);
  const reopened = await open(await saved(doc));
  expect(changedPixels(before, raster(reopened))).toBe(0);
}

async function expectRefused(bytes: Uint8Array): Promise<void> {
  const doc = await open(bytes);
  const before = raster(doc);
  const runsBefore = doc.page(0).runs.map((r) => r.snapshot());
  const history = new HistoryStack();
  let refusal: unknown = null;
  try {
    history.execute(recolour(doc), doc);
  } catch (err) {
    refusal = err;
  }
  expect(refusal).toBeInstanceOf(HistoryStepError);
  expect((refusal as HistoryStepError).documentIntact).toBe(true);
  expect(history.canUndo).toBe(false);
  expect(doc.page(0).runs.map((r) => r.snapshot())).toEqual(runsBefore);
  expect(changedPixels(before, raster(doc))).toBe(0);
  const reopened = await open(await saved(doc));
  expect(changedPixels(before, raster(reopened))).toBe(0);
}

const MULTIPLY = "<< /Type /ExtGState /BM /Multiply >>";
const HALF = "<< /Type /ExtGState /ca 0.5 /CA 0.5 >>";

describe("lifting form contents onto the page", () => {
  test("is refused when the form is drawn through a clip that hides part of it", async () => {
    await expectRefused(
      fixture({ page: "q 100 100 75 100 re W n 1 0 0 1 100 100 cm /Fm Do Q" }),
    );
  });

  test("keeps the drawing when the clip hides nothing on the page", async () => {
    await expectLiftedFaithfully(
      fixture({ page: "q 0 0 300 300 re W n 1 0 0 1 100 100 cm /Fm Do Q" }),
    );
  });

  test("keeps the drawing when the clip only cuts what is off the page", async () => {
    await expectLiftedFaithfully(
      fixture({ page: "q 0 0 300 300 re W n 1 0 0 1 200 150 cm /Fm Do Q" }),
    );
  });

  test("is refused when the form blends with a graphics state of its own", async () => {
    await expectRefused(
      fixture({
        page: "q 1 0 0 1 100 100 cm /Fm Do Q",
        formResources: "/ExtGState << /Blend 8 0 R >>",
        form: "/Blend gs 0 0 1 rg 0 0 200 40 re f",
        extra: [MULTIPLY],
      }),
    );
  });

  test("is refused when the form sets its own opacity", async () => {
    await expectRefused(
      fixture({
        page: "q 1 0 0 1 100 100 cm /Fm Do Q",
        formResources: "/ExtGState << /Half 8 0 R >>",
        form: "/Half gs 0 0 1 rg 0 0 200 40 re f",
        extra: [HALF],
      }),
    );
  });

  test("is refused when the form's graphics state name means something else on the page", async () => {
    await expectRefused(
      fixture({
        page: "q /G0 gs 0 1 0 rg 0 200 300 50 re f Q q 1 0 0 1 100 100 cm /Fm Do Q",
        pageResources: "/ExtGState << /G0 8 0 R >>",
        formResources: "/ExtGState << /G0 9 0 R >>",
        form: "/G0 gs 0 0 1 rg 0 0 200 40 re f",
        extra: [HALF, MULTIPLY],
      }),
    );
  });

  test("keeps the drawing when the page binds the form's graphics state names to the same objects", async () => {
    await expectLiftedFaithfully(
      fixture({
        page: "q /G0 gs 0 1 0 rg 0 200 300 50 re f Q q 1 0 0 1 100 100 cm /Fm Do Q",
        pageResources: "/ExtGState << /G0 8 0 R >>",
        formResources: "/ExtGState << /G0 8 0 R >>",
        form: "/G0 gs 0 0 1 rg 0 0 200 40 re f",
        extra: [HALF],
      }),
    );
  });

  test("is refused when the form fills with a pattern of its own", async () => {
    await expectRefused(
      fixture({
        page: "q 1 0 0 1 100 100 cm /Fm Do Q",
        formResources: "/Pattern << /P1 8 0 R >>",
        form: "/Pattern cs /P1 scn 0 0 200 40 re f",
        extra: [
          "<< /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 200 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [0 1 0] /C1 [1 0 1] /N 1 >> >> >>",
        ],
      }),
    );
  });

  test("is refused when the form is optional content", async () => {
    const bytes = buildClassicPdf(
      [
        {
          num: 1,
          body: "<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [8 0 R] /D << /OFF [8 0 R] >> >> >>",
        },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /XObject << /Fm 5 0 R /Shown 7 0 R >> /Properties << /oc1 8 0 R >> >> >>",
        },
        {
          num: 4,
          body: streamBody(
            "",
            "q 1 0 0 1 50 50 cm /Shown Do Q /OC /oc1 BDC q 1 0 0 1 50 150 cm /Fm Do Q EMC",
          ),
        },
        {
          num: 5,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 200 100] /Resources << /Font << /F1 6 0 R >> >>",
            "BT /F1 14 Tf 0 50 Td (Hidden words) Tj ET",
          ),
        },
        { num: 6, body: FONT },
        {
          num: 7,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 200 100] /Resources << /Font << /F1 6 0 R >> >>",
            TEXT,
          ),
        },
        { num: 8, body: "<< /Type /OCG /Name (Hidden) >>" },
      ],
      1,
    );
    const doc = await open(bytes);
    const before = raster(doc);
    const hidden = doc.page(0).runs.find((r) => r.text === "Hidden words");
    const history = new HistoryStack();
    expect(() =>
      history.execute(
        new SetColourCommand({
          pageIndex: 0,
          runId: hidden!.id,
          nextFill: RED,
        }),
        doc,
      ),
    ).toThrow(HistoryStepError);
    expect(history.canUndo).toBe(false);
    const reopened = await open(await saved(doc));
    expect(changedPixels(before, raster(reopened))).toBe(0);
  });

  test("refuses a shape delete in a group drawn at a page opacity its own graphics state would replace", async () => {
    const doc = await open(
      buildClassicPdf(
        [
          { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
          { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
          {
            num: 3,
            body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SIZE} ${SIZE}] /Contents 4 0 R /Resources << /XObject << /Fm 5 0 R >> /ExtGState << /Faint 7 0 R >> >> >>`,
          },
          {
            num: 4,
            body: streamBody(
              "",
              "1 0 0 rg 0 0 300 300 re f q /Faint gs 1 0 0 1 50 100 cm /Fm Do Q",
            ),
          },
          {
            num: 5,
            body: streamBody(
              "/Type /XObject /Subtype /Form /BBox [0 0 200 100] /Group << /S /Transparency /I true >> /Resources << /ExtGState << /Half 6 0 R >> >>",
              "/Half gs 0 0 1 rg 0 0 200 40 re f 0 1 0 rg 100 20 100 80 re f",
            ),
          },
          { num: 6, body: HALF },
          { num: 7, body: "<< /Type /ExtGState /ca 0.1 /CA 0.1 >>" },
        ],
        1,
      ),
    );
    const page = doc.page(0);
    const before = raster(doc);
    const shapesBefore = page.shapes.map((s) => s.id);
    const target = page.shapes.find(
      (s) => s.containerPtr && Math.abs(s.bounds.height - 40) < 1,
    );
    expect(target).toBeDefined();
    const history = new HistoryStack();
    let refusal: unknown = null;
    try {
      history.execute(
        new DeleteShapeCommand({ pageIndex: 0, shapeId: target!.id }),
        doc,
      );
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeInstanceOf(HistoryStepError);
    expect((refusal as HistoryStepError).documentIntact).toBe(true);
    expect(String((refusal as HistoryStepError).cause)).toContain(
      "drawn as part of a group",
    );
    expect(history.canUndo).toBe(false);
    expect(page.shapes.map((s) => s.id)).toEqual(shapesBefore);
    expect(changedPixels(before, raster(doc))).toBe(0);
    const reopened = await open(await saved(doc));
    expect(changedPixels(before, raster(reopened))).toBe(0);
  });

  test("lifts nested forms and keeps their drawing", async () => {
    const bytes = buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /XObject << /Outer 5 0 R >> >> >>",
        },
        { num: 4, body: streamBody("", "q 1 0 0 1 40 60 cm /Outer Do Q") },
        {
          num: 5,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 260 200] /Resources << /XObject << /Inner 7 0 R >> >>",
            "0 0 1 rg 0 0 30 30 re f q 0.5 0 0 0.5 20 20 cm /Inner Do Q",
          ),
        },
        { num: 6, body: FONT },
        {
          num: 7,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 400 200] /Resources << /Font << /F1 6 0 R >> >>",
            `0.8 0.8 0.8 rg 0 0 400 100 re f ${TEXT}`,
          ),
        },
      ],
      1,
    );
    await expectLiftedFaithfully(bytes);
  });

  test("is refused when a nested form is clipped inside its parent", async () => {
    const bytes = buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /XObject << /Outer 5 0 R >> >> >>",
        },
        { num: 4, body: streamBody("", "q 1 0 0 1 40 60 cm /Outer Do Q") },
        {
          num: 5,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 260 200] /Resources << /XObject << /Inner 7 0 R >> >>",
            "q 0 0 80 200 re W n /Inner Do Q",
          ),
        },
        { num: 6, body: FONT },
        {
          num: 7,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 400 200] /Resources << /Font << /F1 6 0 R >> >>",
            `0.8 0.8 0.8 rg 0 0 200 100 re f ${TEXT}`,
          ),
        },
      ],
      1,
    );
    await expectRefused(bytes);
  });

  test("leaves the form's other uses drawing it whole", async () => {
    const bytes = fixture({
      page: "q 1 0 0 1 50 20 cm /Fm Do Q q 1 0 0 1 50 160 cm /Fm Do Q",
    });
    const doc = await open(bytes);
    const before = raster(doc);
    const runs = doc
      .page(0)
      .runs.filter((r) => r.text.startsWith("Trustworthy document"));
    expect(runs).toHaveLength(2);
    const lower = runs.reduce((a, b) => (a.bounds.y < b.bounds.y ? a : b));
    const history = new HistoryStack();
    history.execute(
      new SetColourCommand({ pageIndex: 0, runId: lower.id, nextFill: RED }),
      doc,
    );
    const out = await saved(doc);
    expect(toLatin1(out)).toMatch(/\/Subtype\s*\/Form/);
    const after = raster(await open(out));
    let upperChanged = 0;
    let lowerChanged = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        if (![0, 1, 2].some((c) => Math.abs(before[i + c] - after[i + c]) > 2))
          continue;
        if (y < SIZE / 2) upperChanged++;
        else lowerChanged++;
      }
    }
    expect(upperChanged).toBe(0);
    expect(lowerChanged).toBeGreaterThan(0);
  });

  test("a merge that would lift one form it cannot keep lifts none", async () => {
    const bytes = buildClassicPdf(
      [
        { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
        { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
        {
          num: 3,
          body: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R /Resources << /XObject << /Free 5 0 R /Clipped 7 0 R >> >> >>",
        },
        {
          num: 4,
          body: streamBody(
            "",
            "q 1 0 0 1 20 200 cm /Free Do Q q 20 100 60 40 re W n 1 0 0 1 20 100 cm /Clipped Do Q",
          ),
        },
        {
          num: 5,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 200 40] /Resources << /Font << /F1 6 0 R >> >>",
            "BT /F1 14 Tf 0 10 Td (Free words) Tj ET",
          ),
        },
        { num: 6, body: FONT },
        {
          num: 7,
          body: streamBody(
            "/Type /XObject /Subtype /Form /BBox [0 0 200 40] /Resources << /Font << /F1 6 0 R >> >>",
            "BT /F1 14 Tf 0 10 Td (Clipped words) Tj ET",
          ),
        },
      ],
      1,
    );
    const doc = await open(bytes);
    const free = doc.page(0).runs.find((r) => r.text.startsWith("Free words"))!;
    const clipped = doc.page(0).runs.find((r) => r.text === "Clipped words")!;
    const container = free.containerPtr;
    const history = new HistoryStack();
    expect(() =>
      history.execute(
        new MergeRunsCommand({
          pageIndex: 0,
          runIds: [free.id, clipped.id],
        }),
        doc,
      ),
    ).toThrow(HistoryStepError);
    expect(container).not.toBe(0);
    expect(free.containerPtr).toBe(container);
    expect(history.canUndo).toBe(false);
  });
});
