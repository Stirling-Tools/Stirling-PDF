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
  describe,
  expect,
  test,
  vi,
} from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { getDroppedBase14Chars } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  SERVER_FONTS_URL,
  forgetServerFontList,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { _resetScanFacesForTests } from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import { FONT_DIR } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/mixed-style-sample.pdf",
);
const JP_FACE_ID = "1".padStart(64, "0");
const FPDF_PAGEOBJ_TEXT = 1;

let wasm: Buffer;
const stores: EditorStore[] = [];

function serveJapanese(): void {
  get.mockImplementation(async (url: string) => {
    if (url === SERVER_FONTS_URL)
      return {
        data: {
          families: [
            {
              family: "Noto Sans JP",
              faces: [
                {
                  id: JP_FACE_ID,
                  style: "Regular",
                  bold: false,
                  italic: false,
                  weight: 400,
                  postscriptName: "NotoSansJP-Regular",
                },
              ],
            },
          ],
        },
      };
    if (url.endsWith(JP_FACE_ID))
      return {
        data: new Uint8Array(
          readFileSync(path.join(FONT_DIR, "NotoSansJP-Regular.ttf")),
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

beforeEach(() => {
  get.mockReset();
  forgetServerFontList();
  _resetScanFacesForTests();
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
  for (const store of stores.splice(0)) store.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function storeWithSample(): Promise<EditorStore> {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  const store = new EditorStore();
  stores.push(store);
  await store.setDocument(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return store;
}

// Every text object on the first page as "text@BaseFont", subset tag stripped.
function drawnTexts(doc: EditorDocument): string[] {
  const m = doc.module;
  const page = doc.page(0);
  const text = m.pdfium.wasmExports.malloc(512);
  const name = m.pdfium.wasmExports.malloc(256);
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  const out: string[] = [];
  try {
    for (let i = 0; i < m.FPDFPage_CountObjects(page.pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(page.pagePtr, i);
      if (m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_TEXT) continue;
      m.FPDFTextObj_GetText(obj, textPage, text, 512);
      m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(obj), name, 256);
      out.push(
        `${m.pdfium.UTF16ToString(text).trim()}@${m.pdfium.UTF8ToString(name).replace(/^[A-Z]{6}\+/, "")}`,
      );
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(text);
    m.pdfium.wasmExports.free(name);
  }
  return out;
}

function typeAtEnd(store: EditorStore, needle: string, add: string): string {
  const run = store
    .document!.page(0)
    .runs.find((r) => r.text.includes(needle))!;
  const before = run.text;
  store.dispatch(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: run.text + add,
    }),
  );
  return before;
}

describe("typing text of a script no loaded font draws", () => {
  test("draws it in a served font of that script once the font arrives", async () => {
    serveJapanese();
    const store = await storeWithSample();
    const doc = store.document!;

    typeAtEnd(store, "Note:", " 日本語");

    await vi.waitFor(() =>
      expect(drawnTexts(doc)).toContain("日本語@NotoSansJP-Regular"),
    );
    expect(getDroppedBase14Chars()).not.toContain("日");
  });

  test("leaves the rest of the paragraph in its own faces and symbols when it redraws", async () => {
    serveJapanese();
    const store = await storeWithSample();
    const doc = store.document!;
    const run = doc.page(0).runs.find((r) => r.text.includes("Ratio"))!;
    const at = run.text.indexOf("Ratio") + "Ratio ".length;
    const untouched = drawnTexts(doc).filter((t) => !t.startsWith("Ratio"));

    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.slice(0, at) + "日本語 " + run.text.slice(at),
      }),
    );
    await vi.waitFor(() =>
      expect(drawnTexts(doc)).toContain("日本語@NotoSansJP-Regular"),
    );

    const after = drawnTexts(doc);
    expect(after).toEqual(expect.arrayContaining(untouched));
    for (const kept of ["Ratio", "a", "≥", "b", "→", "c,", "done"])
      expect(after).toContain(`${kept}@LiberationSans`);
  });

  test("keeps the edit one undo step after redrawing it", async () => {
    serveJapanese();
    const store = await storeWithSample();
    const doc = store.document!;

    const before = typeAtEnd(store, "Note:", " 日本語");
    await vi.waitFor(() =>
      expect(drawnTexts(doc)).toContain("日本語@NotoSansJP-Regular"),
    );

    store.undo();

    expect(drawnTexts(doc).some((t) => t.includes("日本語"))).toBe(false);
    expect(doc.page(0).runs.find((r) => r.text.includes("Note:"))!.text).toBe(
      before,
    );
  });

  test("still drops the text and warns about it when no server font covers it", async () => {
    get.mockRejectedValue(new Error("unavailable"));
    const store = await storeWithSample();

    typeAtEnd(store, "Note:", " 日本語");

    expect(getDroppedBase14Chars()).toContain("日");
    await vi.waitFor(() =>
      expect(get).toHaveBeenCalledWith(SERVER_FONTS_URL, expect.anything()),
    );
    expect(drawnTexts(store.document!).some((t) => t.includes("日本語"))).toBe(
      false,
    );
  });
});
