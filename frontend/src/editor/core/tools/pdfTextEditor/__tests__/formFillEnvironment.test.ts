// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);

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

afterEach(() => vi.restoreAllMocks());

afterAll(() => vi.unstubAllGlobals());

async function open() {
  return EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
}

test("disposing the document releases the form-fill info", async () => {
  const doc = await open();
  const openInfo = vi.spyOn(doc.module, "PDFiumExt_OpenFormFillInfo");
  const closeInfo = vi.spyOn(doc.module, "PDFiumExt_CloseFormFillInfo");

  expect(doc.formEnvironment()).not.toBeNull();
  const info = openInfo.mock.results[0]?.value;
  expect(closeInfo).not.toHaveBeenCalled();

  doc.dispose();

  expect(closeInfo).toHaveBeenCalledExactlyOnceWith(info);
});

test("a failed form-fill set-up releases the info it opened", async () => {
  const doc = await open();
  const openInfo = vi.spyOn(doc.module, "PDFiumExt_OpenFormFillInfo");
  const closeInfo = vi.spyOn(doc.module, "PDFiumExt_CloseFormFillInfo");
  vi.spyOn(doc.module, "PDFiumExt_InitFormFillEnvironment").mockImplementation(
    () => {
      throw new Error("init failed");
    },
  );

  expect(doc.formEnvironment()).toBeNull();

  expect(closeInfo).toHaveBeenCalledExactlyOnceWith(
    openInfo.mock.results[0]?.value,
  );
  doc.dispose();
  expect(closeInfo).toHaveBeenCalledTimes(1);
});
