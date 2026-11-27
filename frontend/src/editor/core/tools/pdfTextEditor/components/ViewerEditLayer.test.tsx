import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { render, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const store = new EditorStore();

vi.mock("@editor/tools/pdfTextEditor/hooks/useEditorStore", async (orig) => ({
  ...(await orig<object>()),
  useSharedEditorStore: () => store,
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ pdfRenderMode: "normal" }),
}));
vi.mock("@editor/tools/pdfTextEditor/components/PageView", () => ({
  PageView: () => <div data-testid="page-view" />,
}));

import { ViewerEditLayer } from "@editor/tools/pdfTextEditor/components/ViewerEditLayer";

const FIXTURE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/rotated-pages.pdf",
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

afterAll(() => {
  store.dispose();
  vi.unstubAllGlobals();
});

describe("a quarter-turned page the loader has not read", () => {
  test("is read and mounted when the viewer shows it", async () => {
    const doc = await EditorDocument.open(
      new Uint8Array(await readFile(FIXTURE)),
    );
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
    // Page 2 of the fixture has /Rotate 90 and is not square.
    const turned = 1;
    const { width, height } = doc.pageSize(turned);
    expect(width).not.toBeCloseTo(height, 0);

    // The viewer lays the page out unrotated: its box is the display size swapped.
    const { findByTestId } = render(
      <ViewerEditLayer
        pageIndex={turned}
        width={height}
        height={width}
        onCovered={() => {}}
      />,
    );

    await waitFor(() =>
      expect(store.getState().pages[turned].display.rotate % 2).toBe(1),
    );
    expect(await findByTestId("page-view")).toBeTruthy();
  });
});
