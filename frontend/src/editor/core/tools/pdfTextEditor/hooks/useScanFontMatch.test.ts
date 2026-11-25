import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock(
  "@editor/tools/pdfTextEditor/commands/scanTextEdit",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    scanEditOf: () => null,
    scanBlockUndrawable: () => false,
    scanBlockOffInk: () => false,
    rerankScanStyles: () => [],
  }),
);
import {
  APPROXIMATE_MATCH_SCORE,
  isApproximateMatch,
  useScanFontMatch,
} from "@editor/tools/pdfTextEditor/hooks/useScanFontMatch";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import { RENDER_MODE_INVISIBLE } from "@editor/tools/pdfTextEditor/types";
import type {
  RankedStyle,
  ScanStyle,
} from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  HELVETICA,
  TIMES,
  type Face,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

const style: ScanStyle = {
  family: "Helvetica",
  fontSize: 12,
  stretch: 1,
  ink: { r: 0, g: 0, b: 0, a: 255 },
  weight: 0,
  hollow: 0,
  softness: 0,
};

const ranked = (face: Face, score: number): RankedStyle => ({
  face,
  style: { ...style, family: face.family },
  score,
});

describe("approximate scan font matches", () => {
  test("flags a best match that scores under the threshold", () => {
    const choices = [ranked(HELVETICA, 0.74), ranked(TIMES, 0.72)];
    expect(isApproximateMatch(choices, choices[0])).toBe(true);
  });

  test("does not flag a best match at or over the threshold", () => {
    const choices = [
      ranked(HELVETICA, APPROXIMATE_MATCH_SCORE),
      ranked(TIMES, 0.6),
    ];
    expect(isApproximateMatch(choices, choices[0])).toBe(false);
  });

  test("does not flag the only font that can draw the script", () => {
    const only = [ranked(HELVETICA, 0.57)];
    expect(isApproximateMatch(only, only[0])).toBe(false);
  });
});

function fakeDocument(pageCount: number) {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    index: i,
    findRun: (id: string) =>
      id === `r${i}`
        ? { id, text: "Invoice", renderMode: RENDER_MODE_INVISIBLE }
        : undefined,
  }));
  return {
    page: (i: number) => {
      if (!pages[i]) throw new Error(`no page ${i}`);
      return pages[i];
    },
  };
}

const viewOf = (pageCount: number) =>
  ({
    pages: Array.from({ length: pageCount }, (_, pageIndex) => ({
      pageIndex,
      runs: [
        {
          id: `r${pageIndex}`,
          text: "Invoice",
          renderMode: RENDER_MODE_INVISIBLE,
        },
      ],
    })),
  }) as unknown as EditorViewState;

describe("the scan font picker", () => {
  test("closes when another document replaces the one it was opened on", () => {
    const store = { document: fakeDocument(3), dispatch: () => {} };
    const selected = { runIds: ["r2"] } as unknown as SelectionState;
    const view = renderHook(
      ({ state, selection }) =>
        useScanFontMatch(store as unknown as EditorStore, state, selection),
      { initialProps: { state: viewOf(3), selection: selected } },
    );
    act(() => view.result.current!.show());
    expect(view.result.current?.open).toBe(true);

    store.document = fakeDocument(1);
    view.rerender({
      state: viewOf(1),
      selection: { runIds: [] } as unknown as SelectionState,
    });
    expect(view.result.current).toBeNull();
  });
});
