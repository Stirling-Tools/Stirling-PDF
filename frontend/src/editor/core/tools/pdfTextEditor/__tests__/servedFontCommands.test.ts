// @vitest-environment node
import { readFileSync } from "node:fs";
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

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  deviceFontDrawsAnyOf,
  emitDeviceFontTextObject,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { setClosestFont } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import { loadExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  SERVER_FONTS_URL,
  forgetServerFontList,
  loadServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { FONT_DIR } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const SERVED = [
  ["Liberation Sans", "LiberationSans-Regular.ttf"],
  ["Liberation Serif", "LiberationSerif-Regular.ttf"],
] as const;
const faceId = (i: number) => (i + 1).toString(16).padStart(64, "0");
const opened: EditorDocument[] = [];
let wasm: Buffer<ArrayBuffer>;

let served: ReadonlyArray<readonly [string, string]> = SERVED;

function serveFonts(): void {
  get.mockImplementation(async (url: string) => {
    if (url === SERVER_FONTS_URL)
      return {
        data: {
          families: served.map(([family, file], i) => ({
            family,
            faces: [
              {
                id: faceId(i),
                style: "Regular",
                bold: false,
                italic: false,
                weight: 400,
                postscriptName: file.replace(".ttf", ""),
              },
            ],
          })),
        },
      };
    const index = served.findIndex((_, i) => url.endsWith(faceId(i)));
    if (index >= 0)
      return {
        data: new Uint8Array(
          readFileSync(path.join(FONT_DIR, served[index][1])),
        ).buffer,
      };
    throw new Error("unavailable");
  });
}

beforeAll(async () => {
  wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
});

beforeEach(async () => {
  served = SERVED;
  get.mockReset();
  forgetServerFontList();
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
  serveFonts();
  await loadServerFonts();
  for (const [family] of SERVED) await loadExternalFontBytes(family);
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
  forgetServerFontList();
});

afterAll(() => vi.unstubAllGlobals());

async function open(name: string): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(path.join(FIXTURES, name))),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

function fontNameOf(doc: EditorDocument, ptr: number): string {
  const m = doc.module;
  const name = m.pdfium.wasmExports.malloc(256);
  try {
    m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(ptr), name, 256);
    return m.pdfium.UTF8ToString(name).replace(/^[A-Z]{6}\+/, "");
  } finally {
    m.pdfium.wasmExports.free(name);
  }
}

test("duplicates a line whose missing letters come from a served lookalike", async () => {
  const doc = await open("subset-font-sample.pdf");
  const page = doc.page(0);
  const run = page.runs[0];
  setClosestFont(run.fontId, "Liberation Sans");
  const before = page.runs.length;

  const cmd = new DuplicateRunCommand({ pageIndex: 0, runId: run.id });
  cmd.apply(doc);

  expect(page.runs).toHaveLength(before + 1);
  const copy = page.findRun(cmd.insertedRunId!)!;
  expect(copy.text).toBe(run.text);
  expect(fontNameOf(doc, copy.pdfiumObjPtr)).toBe("LiberationSans");

  cmd.revert(doc);
  expect(page.runs).toHaveLength(before);
});

test("redo keeps a served font after the server's font list is reloaded", async () => {
  const doc = await open("subset-font-sample.pdf");
  const run = doc.page(0).runs[0];
  const cmd = new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Liberation Serif",
  });
  cmd.apply(doc);
  expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe("LiberationSerif");

  cmd.revert(doc);
  forgetServerFontList();
  cmd.apply(doc);

  expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe("LiberationSerif");
});

test("redo keeps the face a font change drew in after another server offers a different one", async () => {
  const doc = await open("subset-font-sample.pdf");
  const run = doc.page(0).runs[0];
  const cmd = new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Liberation Serif",
  });
  cmd.apply(doc);
  cmd.revert(doc);

  served = [["Liberation Serif", "LiberationSerif-Bold.ttf"]];
  forgetServerFontList();
  await loadServerFonts();
  await loadExternalFontBytes("Liberation Serif");
  cmd.apply(doc);

  expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe("LiberationSerif");
});

test("checks typed letters against the face the document holds, not a newer one of the same name", async () => {
  const doc = await open("subset-font-sample.pdf");
  const page = doc.page(0);
  const black = { r: 0, g: 0, b: 0, a: 255 };
  const draw = (text: string) =>
    emitDeviceFontTextObject(
      doc,
      page,
      "Liberation Serif",
      text,
      12,
      black,
      40,
      40,
    );
  expect(draw("Latin")).not.toBe(0);

  served = [["Liberation Serif", "NotoSansJP-Regular.ttf"]];
  forgetServerFontList();
  await loadServerFonts();
  await loadExternalFontBytes("Liberation Serif");
  expect(deviceFontDrawsAnyOf("Liberation Serif", "漢字")).toBe(true);

  expect(draw("漢字")).toBe(0);
});

test("a duplicated right-to-left line is drawn in the same direction as the original", async () => {
  served = [["Noto Sans Hebrew", "NotoSansHebrew-Regular.ttf"]];
  forgetServerFontList();
  await loadServerFonts();
  await loadExternalFontBytes("Noto Sans Hebrew");
  const doc = await open("rtl-sample.pdf");
  const page = doc.page(0);
  const run = page.runs.find((r) => /^[\u0590-\u05ff ]+$/.test(r.text))!;
  setClosestFont(run.fontId, "Noto Sans Hebrew");

  const cmd = new DuplicateRunCommand({ pageIndex: 0, runId: run.id });
  cmd.apply(doc);

  const saved = await EditorDocument.open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  opened.push(saved);
  PdfiumTextReader.populate(saved, saved.page(0));
  const squash = (text: string) => text.replace(/\s+/g, "");
  const lines = saved
    .page(0)
    .runs.flatMap((r) => r.text.split("\n"))
    .filter((line) => /^[\u0590-\u05ff ]+$/.test(line));
  expect(lines.map(squash)).toEqual([squash(run.text), squash(run.text)]);
});
