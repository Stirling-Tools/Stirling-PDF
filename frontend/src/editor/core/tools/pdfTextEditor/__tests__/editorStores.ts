import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

export const FIXTURES = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures",
);

/** Serves the bundled PDFium wasm to the editor's loader in place of `fetch` for the calling file's tests; call at its top level. */
export function servePdfiumWasm(): void {
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
  afterAll(() => vi.unstubAllGlobals());
}

/** Opens PDFs into editor stores with page 0 read, each disposed after the test that opened it; call at a test file's top level. */
export function editorStores() {
  const stores: EditorStore[] = [];
  afterEach(() => {
    for (const store of stores.splice(0)) store.dispose();
  });
  async function storeWith(bytes: Uint8Array): Promise<EditorStore> {
    const doc = await EditorDocument.open(bytes);
    const store = new EditorStore();
    stores.push(store);
    await store.setDocument(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    return store;
  }
  async function fixture(name: string): Promise<EditorStore> {
    return storeWith(new Uint8Array(await readFile(path.join(FIXTURES, name))));
  }
  return { storeWith, fixture };
}

// jsdom's Blob reads back through FileReader only.
export async function savedBytes(store: EditorStore): Promise<Uint8Array> {
  const blob = await exportToBlob(store.document!);
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
}
