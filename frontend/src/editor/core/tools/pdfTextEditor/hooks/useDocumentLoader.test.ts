// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCallback: <T>(fn: T) => fn,
}));

import {
  readPageOnceVisible,
  useDocumentLoader,
} from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { pageViewHandlers } from "@editor/tools/pdfTextEditor/util/pageViewHandlers";

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

  test("leaves a later operation's loading flag alone while reading text", async () => {
    const store = new EditorStore();
    try {
      const load = useDocumentLoader(store);
      const loading = load(
        new File([await readFile(SAMPLE)], "multi.pdf", {
          type: "application/pdf",
        }),
      );
      await vi.waitFor(
        () => expect(store.getState().pages.length).toBeGreaterThan(0),
        {
          timeout: 15_000,
        },
      );
      // Bulk tagging claims the flag while the loader still has text to read.
      store.setLoading(true);
      store.markFirstPageRendered();
      await loading;

      expect(store.getState().pages[0].runs.length).toBeGreaterThan(0);
      expect(store.getState().loading).toBe(true);
    } finally {
      store.dispose();
    }
  });

  test("publishes pages it read when a newer load fails before replacing it", async () => {
    const store = new EditorStore();
    const load = useDocumentLoader(store);
    const realPopulate = PdfiumTextReader.populate.bind(PdfiumTextReader);
    let newer: Promise<boolean> | null = null;
    const spy = vi
      .spyOn(PdfiumTextReader, "populate")
      .mockImplementation((...args) => {
        newer ??= load(new File([new Uint8Array([1, 2, 3])], "broken.pdf"));
        return realPopulate(...args);
      });
    try {
      const first = load(
        new File([await readFile(SAMPLE)], "multi.pdf", {
          type: "application/pdf",
        }),
      );
      await vi.waitFor(
        () => expect(store.getState().pages.length).toBeGreaterThan(0),
        {
          timeout: 15_000,
        },
      );
      const doc = store.document;
      store.markFirstPageRendered();

      expect(await first).toBe(true);
      expect(await newer).toBe(false);
      expect(store.document).toBe(doc);
      expect(store.getState().pages[0].runs.length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
      store.dispose();
    }
  });

  test("holds a visible page's text read until the first page has painted", async () => {
    const store = new EditorStore();
    const spy = vi.spyOn(PdfiumTextReader, "populate");
    try {
      const loading = useDocumentLoader(store)(
        new File([await readFile(SAMPLE)], "multi.pdf", {
          type: "application/pdf",
        }),
      );
      await vi.waitFor(
        () => expect(store.getState().pages.length).toBeGreaterThan(0),
        { timeout: 15_000 },
      );

      readPageOnceVisible(store, 0);
      expect(spy).not.toHaveBeenCalled();

      store.markFirstPageRendered();
      await vi.waitFor(() =>
        expect(store.getState().pages[0].runs.length).toBeGreaterThan(0),
      );
      await loading;
    } finally {
      spy.mockRestore();
      store.dispose();
    }
  });

  test("text added to a page before it is read keeps its run", async () => {
    const store = new EditorStore();
    try {
      const loading = useDocumentLoader(store)(
        new File([await readFile(SAMPLE)], "multi.pdf", {
          type: "application/pdf",
        }),
      );
      await vi.waitFor(
        () => expect(store.getState().pages.length).toBeGreaterThan(0),
        { timeout: 15_000 },
      );
      const handlers = pageViewHandlers(store);
      handlers.onFirstVisible?.(0);
      store.setMode("addText");
      handlers.onPageClick?.(0, 72, 72);
      const [insertedId] = store.selection.value.runIds;

      store.markFirstPageRendered();
      await loading;

      const runs = store.document!.page(0).runs.map((run) => run.id);
      expect(runs).toContain(insertedId);
    } finally {
      store.dispose();
    }
  });

  test("a failed text read leaves a later operation's loading flag alone", async () => {
    const store = new EditorStore();
    const spy = vi
      .spyOn(PdfiumTextReader, "populate")
      .mockImplementation(() => {
        throw new Error("unreadable page");
      });
    try {
      const loading = useDocumentLoader(store)(
        new File([await readFile(SAMPLE)], "multi.pdf", {
          type: "application/pdf",
        }),
      );
      await vi.waitFor(
        () => expect(store.getState().pages.length).toBeGreaterThan(0),
        { timeout: 15_000 },
      );
      store.setLoading(true);
      store.markFirstPageRendered();
      await loading;

      expect(store.getState().error).toBe("unreadable page");
      expect(store.getState().loading).toBe(true);
    } finally {
      spy.mockRestore();
      store.dispose();
    }
  });
});
