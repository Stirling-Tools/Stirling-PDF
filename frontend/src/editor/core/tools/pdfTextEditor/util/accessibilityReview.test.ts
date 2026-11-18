import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SetAltTextCommand } from "@editor/tools/pdfTextEditor/commands/SetAltTextCommand";
import { RetagBlockCommand } from "@editor/tools/pdfTextEditor/commands/RetagBlockCommand";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  nextNeedingAttention,
  pageAttention,
  reviewAccessibility,
} from "@editor/tools/pdfTextEditor/util/accessibilityReview";
import { formulasPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

beforeAll(async () => {
  const wasmBytes = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

async function openFormulas() {
  const store = new EditorStore();
  const doc = await EditorDocument.open(formulasPdf());
  await store.setDocument(doc);
  const page = doc.page(0);
  store.publishPages([
    {
      pageIndex: 0,
      width: page.width,
      height: page.height,
      dirty: false,
      revision: 0,
      runs: [],
      images: [],
      shapes: [],
      display: page.display.toData(),
    },
  ]);
  ensurePageRead(store, 0);
  const pages = () => store.getState().pages;
  const idOf = (text: string) =>
    pages()[0].runs.find((r) => r.text.includes(text))!.id;
  return { store, doc, pages, idOf };
}

describe("reviewing text that makes up a formula", () => {
  it("flags an undescribed formula once, on its first run", async () => {
    const { store, doc, pages, idOf } = await openFormulas();
    expect([...pageAttention(doc, pages()[0]).runs.keys()]).toEqual([
      idOf("a = b"),
    ]);
    expect(reviewAccessibility(doc, pages()).needsDescription).toBe(1);
    store.dispose();
  });

  it("walks Next to the formula from anywhere, and stops once it is described", async () => {
    const { store, doc, pages, idOf } = await openFormulas();
    const target = { kind: "text", id: idOf("a = b"), pageIndex: 0 };
    expect(nextNeedingAttention(doc, pages(), null)).toEqual(target);
    expect(nextNeedingAttention(doc, pages(), idOf("Where a is"))).toEqual(
      target,
    );
    expect(nextNeedingAttention(doc, pages(), idOf("a = b"))).toEqual(target);

    store.dispatch(
      new SetAltTextCommand({ pageIndex: 0, mcid: 0, alt: "a equals b" }),
    );
    expect(reviewAccessibility(doc, pages()).needsDescription).toBe(0);
    expect(nextNeedingAttention(doc, pages(), null)).toBeNull();
    store.dispose();
  });

  it("flags a paragraph once retagged as a formula, and drops it retagged back", async () => {
    const { store, doc, pages, idOf } = await openFormulas();
    store.dispatch(
      new RetagBlockCommand({ pageIndex: 0, mcid: 3, type: "Formula" }),
    );
    expect(pageAttention(doc, pages()[0]).runs.has(idOf("Where a is"))).toBe(
      true,
    );
    expect(reviewAccessibility(doc, pages()).needsDescription).toBe(2);

    store.dispatch(new RetagBlockCommand({ pageIndex: 0, mcid: 3, type: "P" }));
    expect(reviewAccessibility(doc, pages()).needsDescription).toBe(1);
    store.dispose();
  });
});
