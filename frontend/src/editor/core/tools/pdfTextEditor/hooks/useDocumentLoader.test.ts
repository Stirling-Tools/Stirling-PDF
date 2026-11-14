// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCallback: <T>(fn: T) => fn,
}));

import { useDocumentLoader } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/multi-page-sample.pdf",
);

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasm, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterAll(() => vi.unstubAllGlobals());

describe("opening a document", () => {
  test("shows every page before reading any text, and reads text once the first page has painted", async () => {
    const store = new EditorStore();
    const events: string[] = [];
    store.subscribe((state) => {
      const pages = state.pages;
      if (pages.length === 0) return;
      const read = pages.filter((p) => p.runs.length > 0).length;
      events.push(`published loading=${state.loading} read=${read}`);
    });
    const realPopulate = PdfiumTextReader.populate.bind(PdfiumTextReader);
    const spy = vi
      .spyOn(PdfiumTextReader, "populate")
      .mockImplementation((...args) => {
        events.push(`read first-painted=${store.getState().firstPageRendered}`);
        return realPopulate(...args);
      });
    try {
      const load = useDocumentLoader(store);
      const file = new File([await readFile(SAMPLE)], "multi.pdf", {
        type: "application/pdf",
      });

      const loading = load(file);
      await vi.waitFor(
        () => {
          expect(store.getState().error).toBeNull();
          expect(events.some((e) => e.startsWith("published"))).toBe(true);
        },
        { timeout: 15_000 },
      );
      expect(events.filter((e) => e.startsWith("read"))).toEqual([]);
      expect(store.getState().loading).toBe(false);

      store.markFirstPageRendered();
      await loading;

      const reads = events.filter((e) => e.startsWith("read"));
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.every((e) => e === "read first-painted=true")).toBe(true);
      expect(store.getState().pages[0].runs.length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
      store.dispose();
    }
  });
});
