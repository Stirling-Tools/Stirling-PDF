// @vitest-environment node
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
import { spanOf } from "@editor/tools/pdfTextEditor/commands/scanStyle";
import {
  emitTextLine,
  getDroppedBase14Chars,
  resetDroppedBase14Chars,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { BLACK } from "@editor/tools/pdfTextEditor/model/Color";
import { uniformTags } from "@editor/tools/pdfTextEditor/model/TextTags";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);

let doc: EditorDocument;

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

beforeEach(async () => {
  resetDroppedBase14Chars();
  doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
});

afterEach(() => doc.dispose());

afterAll(() => vi.unstubAllGlobals());

describe("measuring text a standard font cannot draw", () => {
  test("leaves the save warning's dropped characters alone", () => {
    expect(
      spanOf(doc, doc.page(0), "Hのテキ", "Helvetica", 12),
    ).toBeGreaterThan(0);

    expect(getDroppedBase14Chars()).toEqual([]);
  });

  test("still records the characters a real edit drops", () => {
    emitTextLine({
      doc,
      page: doc.page(0),
      text: "Hのテ",
      x: 0,
      y: 0,
      fontSize: 12,
      fill: BLACK,
      originalFontPtr: 0,
      fallbackFamily: "Helvetica",
      tags: uniformTags([]),
    });

    expect(getDroppedBase14Chars()).toEqual(["の", "テ"]);
  });
});
