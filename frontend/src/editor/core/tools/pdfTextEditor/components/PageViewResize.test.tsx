import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pageSnapshot,
  stubDocument,
  stubbedPageView,
} from "@editor/tools/pdfTextEditor/components/pageViewTestSupport";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";

const { resizable } = vi.hoisted(() => ({
  resizable: new Map<string, boolean>(),
}));

vi.mock("@editor/tools/pdfTextEditor/components/TableOverlay", () => ({
  TableOverlay: () => null,
}));
vi.mock("@editor/tools/pdfTextEditor/components/TextRunOverlay", () => ({
  TextRunOverlay: (props: {
    run: { id: string };
    onResize?: (widthPt: number) => void;
  }) => {
    resizable.set(props.run.id, props.onResize !== undefined);
    return null;
  },
}));

const UPRIGHT = { a: 1, b: 0, c: 0, d: 1, e: 72, f: 700 };
const TURNED = { a: 0, b: 1, c: -1, d: 0, e: 72, f: 700 };

function run(id: string, extra: Partial<TextRunSnapshot>): TextRunSnapshot {
  return {
    id,
    bounds: { x: 72, y: 700, width: 200, height: 12 },
    matrix: UPRIGHT,
    text: id,
    ...extra,
  } as TextRunSnapshot;
}

describe("PageView resize handle", () => {
  const originalObserver = globalThis.IntersectionObserver;

  beforeEach(() => {
    resizable.clear();
    globalThis.IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalObserver;
  });

  it("is offered on upright scanned text and plain text, not on read-only or turned scanned text", () => {
    const live = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
    const page = pageSnapshot(live, [
      run("plain", {}),
      run("scanned", { renderMode: 3 }),
      run("scannedReadOnly", { renderMode: 3, textReadOnly: true }),
      run("scannedTurned", { renderMode: 3, matrix: TURNED }),
      run("readOnly", { textReadOnly: true }),
    ]);
    render(
      stubbedPageView(stubDocument(live), page, { onResizeRun: () => {} }),
    );
    expect(Object.fromEntries(resizable)).toEqual({
      plain: true,
      scanned: true,
      scannedReadOnly: false,
      scannedTurned: false,
      readOnly: false,
    });
  });
});
