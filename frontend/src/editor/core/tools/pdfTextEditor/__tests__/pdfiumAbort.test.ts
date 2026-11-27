// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { loadDocument } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { resetPdfiumModule } from "@editor/services/pdfiumService";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  FIXTURES,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();

const stores: EditorStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

async function openFixture(store: EditorStore, name: string): Promise<void> {
  const file = new File([await readFile(path.join(FIXTURES, name))], name, {
    type: "application/pdf",
  });
  expect(await loadDocument(store, file)).toBe(true);
}

/** Runs the abort hook PDFium's emscripten runtime calls on out-of-memory. */
function abortPdfium(store: EditorStore): void {
  const runtime = store.document!.module.pdfium as unknown as {
    onAbort: (what: unknown) => void;
  };
  runtime.onAbort("OOM");
}

async function storeWithSample(): Promise<EditorStore> {
  const store = new EditorStore();
  stores.push(store);
  await openFixture(store, "sample.pdf");
  return store;
}

test("drops the document without calling into the aborted engine, and says why", async () => {
  const store = await storeWithSample();
  const dispose = vi.spyOn(store.document!, "dispose");

  abortPdfium(store);

  expect(store.document).toBeNull();
  expect(dispose).not.toHaveBeenCalled();
  const state = store.getState();
  expect(state.hasDocument).toBe(false);
  expect(state.documentLost).toBe(true);
  expect(state.error).toMatch(/PDF engine stopped working/);
});

test("keeps saying why when the interrupted operation reports its own failure", async () => {
  const store = await storeWithSample();
  abortPdfium(store);
  const why = store.getState().error;

  store.setError("Could not apply edits on page 1");

  expect(store.getState().error).toBe(why);
});

test("opens the next document on a fresh engine and clears the message", async () => {
  const store = await storeWithSample();
  const aborted = store.document!.module;
  abortPdfium(store);

  await openFixture(store, "tagged-sample.pdf");

  expect(store.document!.module).not.toBe(aborted);
  expect(store.getState().documentLost).toBe(false);
  expect(store.getState().error).toBeNull();
});

test("leaves a document open on another engine alone", async () => {
  const lost = await storeWithSample();
  resetPdfiumModule();
  const kept = await storeWithSample();

  abortPdfium(lost);

  expect(lost.document).toBeNull();
  expect(kept.document).not.toBeNull();
  expect(kept.getState().documentLost).toBe(false);
});
