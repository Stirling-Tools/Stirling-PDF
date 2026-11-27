// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pageChangeCommand } from "@editor/tools/pdfTextEditor/util/documentChanges";
import { editorPageLayout } from "@editor/tools/pdfTextEditor/util/editorPageLayout";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

interface Drawn {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

let drawn: Drawn[] = [];

class FakeOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  getContext() {
    return { putImageData: (image: Drawn) => drawn.push(image) };
  }
  async convertToBlob() {
    return new Blob(["png"], { type: "image/png" });
  }
}

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

beforeEach(() => {
  drawn = [];
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
  vi.stubGlobal("ImageData", FakeImageData);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function inkedPixels(image: Drawn): number {
  let inked = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (
      image.data[i] < 200 ||
      image.data[i + 1] < 200 ||
      image.data[i + 2] < 200
    )
      inked++;
  }
  return inked;
}

describe("editorPageLayout", () => {
  test("draws each thumbnail from the page the editor shows at that position", async () => {
    const store = await fixture("multi-page-sample.pdf");
    const doc = store.document!;
    store.publishPages(
      [0, 1, 2].map(
        (pageIndex) =>
          ({
            pageIndex,
            revision: -1,
            runs: [],
            images: [],
            shapes: [],
            rules: [],
          }) as unknown as PageSnapshot,
      ),
    );
    const layout = editorPageLayout(store);
    expect(layout.pages()).toBeNull();

    store.dispatch(
      pageChangeCommand(doc, { kind: "addPage", after: 0 }).command,
    );
    expect(layout.pages()).toHaveLength(4);
    const added = doc.displayOrder()[1];
    const shown = doc.page(added).shownInViewer;

    await layout.renderThumbnail(0, 120);
    await layout.renderThumbnail(1, 120);
    await layout.renderThumbnail(2, 120);

    expect(drawn.map((image) => image.width)).toEqual([120, 120, 120]);
    expect(inkedPixels(drawn[0])).toBeGreaterThan(0);
    expect(inkedPixels(drawn[1])).toBe(0);
    expect(inkedPixels(drawn[2])).toBeGreaterThan(0);
    expect(doc.page(added).shownInViewer).toBe(shown);
  });

  test("refuses a position the editor does not show", async () => {
    const store = await fixture("multi-page-sample.pdf");
    await expect(
      editorPageLayout(store).renderThumbnail(9, 120),
    ).rejects.toThrow();
  });

  test("gives a new layout when same-sized pages swap places", () => {
    const snapshot = (pageIndex: number) =>
      ({
        pageIndex,
        width: 600,
        height: 800,
        display: { rotate: 0 },
      }) as unknown as PageSnapshot;
    let pages = [snapshot(0), snapshot(1)];
    const store = {
      document: { pagesChanged: () => true },
      getState: () => ({ pages }),
      subscribe: () => () => undefined,
    } as unknown as EditorStore;
    const layout = editorPageLayout(store);

    const before = layout.pages();
    pages = [snapshot(0), snapshot(1)];
    expect(layout.pages()).toBe(before);
    pages = [snapshot(1), snapshot(0)];
    expect(layout.pages()).not.toBe(before);
  });
});
