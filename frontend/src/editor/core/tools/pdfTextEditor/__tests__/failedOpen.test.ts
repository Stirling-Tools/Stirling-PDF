// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { loadDocument } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const PASSWORD = "testpass123";
const stores: EditorStore[] = [];

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

afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function fixture(name: string): Promise<File> {
  return new File([await readFile(path.join(FIXTURES, name))], name, {
    type: "application/pdf",
  });
}

async function storeWithSample() {
  const store = new EditorStore();
  stores.push(store);
  expect(await loadDocument(store, await fixture("sample.pdf"))).toBe(true);
  return { store, sample: store.document };
}

test("a file that is not a PDF reports no open and leaves the document on screen", async () => {
  const { store, sample } = await storeWithSample();
  const broken = new File(["this is not a PDF"], "cannot-open.pdf", {
    type: "application/pdf",
  });
  expect(await loadDocument(store, broken)).toBe(false);
  expect(store.document).toBe(sample);
  expect(store.getState().error).toBeTruthy();
});

test("a password prompt reports no open until the password is given", async () => {
  const { store, sample } = await storeWithSample();
  const locked = await fixture("encrypted.pdf");
  expect(await loadDocument(store, locked)).toBe(false);
  expect(store.document).toBe(sample);
  expect(store.getState().passwordPrompt).toBeTruthy();

  expect(await loadDocument(store, locked, PASSWORD)).toBe(true);
  expect(store.document).not.toBe(sample);
  expect(store.getState().passwordPrompt).toBeFalsy();
});

test("a load overtaken by a newer one reports no open", async () => {
  const { store } = await storeWithSample();
  const [older, newer] = await Promise.all([
    fixture("sample.pdf"),
    fixture("paragraph-sample.pdf"),
  ]);
  const first = loadDocument(store, older);
  const second = loadDocument(store, newer);
  expect(await first).toBe(false);
  expect(await second).toBe(true);
});

test("an open whose document is still on screen when a newer open fails still reports the open", async () => {
  const { store, sample } = await storeWithSample();
  let failing: Promise<boolean> | null = null;
  const stop = store.subscribe(() => {
    if (failing || store.document === sample) return;
    failing = loadDocument(
      store,
      new File(["this is not a PDF"], "cannot-open.pdf"),
    );
  });
  const opening = loadDocument(store, await fixture("many-pages-sample.pdf"));
  const opened = await opening;
  stop();
  expect(failing).not.toBeNull();
  expect(await failing).toBe(false);
  expect(opened).toBe(true);
  expect(store.document).not.toBe(sample);
});

test("opens the pages a looping page tree really has", async () => {
  const pdf = buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      {
        num: 2,
        body: "<< /Type /Pages /Kids [6 0 R 3 0 R] /Count 2 /MediaBox [0 0 595 842] >>",
      },
      {
        num: 3,
        body: "<< /Type /Pages /Parent 2 0 R /Kids [4 0 R] /Count 1 >>",
      },
      {
        num: 4,
        body: "<< /Type /Pages /Parent 3 0 R /Kids [5 0 R] /Count 1 >>",
      },
      {
        num: 5,
        body: "<< /Type /Pages /Parent 4 0 R /Kids [3 0 R] /Count 1 >>",
      },
      {
        num: 6,
        body:
          "<< /Type /Page /Parent 2 0 R /Contents 7 0 R " +
          "/Resources << /Font << /F1 8 0 R >> >> >>",
      },
      {
        num: 7,
        body: streamBody("", "BT /F1 12 Tf 72 700 Td (Only page) Tj ET\n"),
      },
      { num: 8, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>" },
    ],
    1,
  );
  const store = new EditorStore();
  stores.push(store);
  const file = new File([new Uint8Array(pdf)], "looping-tree.pdf", {
    type: "application/pdf",
  });

  expect(await loadDocument(store, file)).toBe(true);

  expect(store.getState().error).toBeNull();
  expect(
    store.getState().pages.map((page) => page.runs.map((run) => run.text)),
  ).toEqual([["Only page"]]);
});
