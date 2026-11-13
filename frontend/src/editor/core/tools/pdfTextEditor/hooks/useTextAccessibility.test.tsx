import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { act, renderHook } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  ensureAllPagesRead,
  ensurePageRead,
} from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import {
  setTextTagCommand,
  useTextAccessibility,
} from "@editor/tools/pdfTextEditor/hooks/useTextAccessibility";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import { textTag } from "@editor/tools/pdfTextEditor/util/textAccessibility";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

vi.mock("@editor/constants/featureFlags", () => ({
  ACCESSIBILITY_EDITING: true,
}));

/** Three untagged pages, each with the same footer. */
function footedPdf(): Uint8Array {
  const pages = [10, 12, 14];
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      {
        num: 2,
        body: `<< /Type /Pages /Kids [${pages.map((p) => `${p} 0 R`).join(" ")}] /Count 3 >>`,
      },
      {
        num: 3,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
      ...pages.flatMap((page, i) => [
        {
          num: page,
          body:
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${page + 1} 0 R ` +
            "/Resources << /Font << /F1 3 0 R >> >> >>",
        },
        {
          num: page + 1,
          body: streamBody(
            "",
            `BT /F1 10 Tf 72 400 Td (Body ${i}) Tj ET\n` +
              "BT /F1 10 Tf 72 40 Td (Confidential) Tj ET",
          ),
        },
      ]),
    ],
    1,
  );
}

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

describe("useTextAccessibility other pages", () => {
  it("offers a footer's matches on other pages, and gives them its kind", async () => {
    const store = new EditorStore();
    const doc = await EditorDocument.open(footedPdf());
    await store.setDocument(doc);
    store.publishPages(
      [0, 1, 2].map((pageIndex): PageSnapshot => {
        const page = doc.page(pageIndex);
        return {
          pageIndex,
          width: page.width,
          height: page.height,
          dirty: false,
          revision: 0,
          runs: [],
          images: [],
          shapes: [],
          display: page.display.toData(),
        };
      }),
    );
    ensurePageRead(store, 0);
    const footer = store
      .getState()
      .pages[0].runs.find((r) => r.text.includes("Confidential"))!;
    store.dispatch(
      setTextTagCommand(doc, [{ run: footer, tag: textTag(doc, footer) }], {
        artifact: "Footer",
      })!,
    );
    store.selection.selectOne(footer.id);
    ensureAllPagesRead(store);

    const { result, rerender } = renderHook(() =>
      useTextAccessibility(store, store.getState(), store.selection.value),
    );
    expect(result.current.otherPages?.pages).toBe(2);
    act(() => result.current.otherPages!.onApply());
    rerender();
    expect(result.current.otherPages).toBeNull();
    const kinds = store
      .getState()
      .pages.flatMap((page) => page.runs)
      .filter((r) => r.text.includes("Confidential"))
      .map((r) => r.furniture);
    expect(kinds).toEqual(["Footer", "Footer", "Footer"]);
    store.dispose();
  });
});
