// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  ensureAllPagesRead,
  ensurePageRead,
} from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");

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

async function open(fixture: string): Promise<EditorDocument> {
  return EditorDocument.open(
    new Uint8Array(await readFile(path.join(FIXTURES, fixture))),
  );
}

describe("a page's size before the page is opened", () => {
  test.each([
    "rotated-pages.pdf",
    "cropbox-offset.pdf",
    "cropbox-rotate90.pdf",
    "paragraph-sample.pdf",
  ])("matches the opened page's size in %s", async (fixture) => {
    const sized = await open(fixture);
    const opened = await open(fixture);
    try {
      for (let i = 0; i < sized.pageCount; i++) {
        const size = sized.pageSize(i);
        const page = opened.page(i);
        expect(size.width).toBeCloseTo(page.width, 3);
        expect(size.height).toBeCloseTo(page.height, 3);
      }
    } finally {
      sized.dispose();
      opened.dispose();
    }
  });
});

describe("reading a page published before it was opened", () => {
  test.each([
    ["ensurePageRead", (store: EditorStore) => ensurePageRead(store, 1)],
    ["ensureAllPagesRead", (store: EditorStore) => ensureAllPagesRead(store)],
  ])("gives %s the page's own display transform", async (_name, read) => {
    const doc = await open("rotated-pages.pdf");
    const store = new EditorStore();
    try {
      await store.setDocument(doc);
      store.publishPages(
        Array.from({ length: doc.pageCount }, (_, i) => {
          const { width, height } = doc.pageSize(i);
          return {
            pageIndex: i,
            width,
            height,
            dirty: false,
            revision: 0,
            runs: [],
            images: [],
            shapes: [],
            display: DisplayTransform.identity(width, height).toData(),
          };
        }),
      );

      read(store);

      const snapshot = store.getState().pages[1];
      expect(snapshot.runs.length).toBeGreaterThan(0);
      expect(snapshot.display).toEqual(doc.page(1).display.toData());
      expect(snapshot.display.rotate).not.toBe(0);
    } finally {
      store.dispose();
    }
  });
});

describe("publishing pages no one has opened", () => {
  test("leaves them unopened", async () => {
    const doc = await open("multi-page-sample.pdf");
    const store = new EditorStore();
    try {
      await store.setDocument(doc);
      store.publishPages(
        Array.from({ length: doc.pageCount }, (_, i) => {
          const { width, height } = doc.pageSize(i);
          return {
            pageIndex: i,
            width,
            height,
            dirty: false,
            revision: 0,
            runs: [],
            images: [],
            shapes: [],
            display: DisplayTransform.identity(width, height).toData(),
          };
        }),
      );

      expect(doc.loadedPages()).toEqual([]);
    } finally {
      store.dispose();
    }
  });
});
