import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextRunOverlay } from "@editor/tools/pdfTextEditor/components/TextRunOverlay";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type {
  TextRunSnapshot,
  WidthMode,
} from "@editor/tools/pdfTextEditor/types";

const CHAR_PX = 6;
const longest = (text: string) =>
  Math.max(...text.split(/\r?\n/).map((l) => l.length)) * CHAR_PX;

vi.mock(
  "@editor/tools/pdfTextEditor/util/textMetrics",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    measureFontMetrics: () => ({ ascent: 9, descent: 3 }),
    measureMaxLineWidth: (text: string) => longest(text),
    measureLongestTokenWidth: (text: string) =>
      Math.max(0, ...text.split(/\s+/).map((w) => w.length)) * CHAR_PX,
  }),
);

const PAGE_WIDTH = 200;
const LEFT = 40;
const PAGE_CAP = PAGE_WIDTH - LEFT - 4;

function run(text: string): TextRunSnapshot {
  return {
    id: "r1",
    pageIndex: 0,
    bounds: { x: LEFT, y: 700, width: longest(text), height: 12 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: LEFT, f: 700 },
    text,
    fontId: "base14:Helvetica",
    fontSize: 10,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  };
}

function Harness({
  text,
  widthMode,
  onWrap,
}: {
  text: string;
  widthMode: WidthMode;
  onWrap: (maxWidthPt: number, keepClearBelow?: boolean) => boolean | void;
}) {
  const [current, setCurrent] = useState(text);
  return (
    <TextRunOverlay
      run={run(current)}
      pageHeight={792}
      pageWidth={PAGE_WIDTH}
      transform={DisplayTransform.identity(PAGE_WIDTH, 792)}
      scale={1}
      widthMode={widthMode}
      selected={false}
      onSelect={() => {}}
      onEdit={setCurrent}
      onWrap={onWrap}
    />
  );
}

function renderRun(
  text: string,
  widthMode: WidthMode = "grow",
  wraps: boolean | void = undefined,
) {
  const onWrap = vi.fn((_width: number, _keepClear?: boolean) => wraps);
  render(
    <MantineProvider env="test">
      <Harness text={text} widthMode={widthMode} onWrap={onWrap} />
    </MantineProvider>,
  );
  const box = screen.getByTestId("pdf-editor-run-r1");
  act(() => {
    fireEvent.focus(box);
  });
  return { box, onWrap };
}

function type(box: HTMLElement, text: string): void {
  act(() => {
    box.textContent = text;
    fireEvent.input(box);
  });
}

const SHORT = "Short line";
const LONG = `${SHORT} that the user keeps typing past the page edge`;

describe("Grow mode at the page edge", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("wraps text typed past the page edge at the width left on the page", () => {
    const { box, onWrap } = renderRun(SHORT);
    type(box, LONG);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onWrap).toHaveBeenCalledOnce();
    expect(onWrap.mock.calls[0][0]).toBeCloseTo(PAGE_CAP, 3);
  });

  it("stops the box at the page edge while the user types", () => {
    const { box } = renderRun(SHORT);
    type(box, LONG);
    expect(parseFloat(box.style.width)).toBeLessThanOrEqual(PAGE_CAP);
  });

  it("keeps widening without wrapping while the text still fits on the page", () => {
    const { box, onWrap } = renderRun(SHORT);
    type(box, `${SHORT} plus a few`);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onWrap).not.toHaveBeenCalled();
    expect(parseFloat(box.style.width)).toBeGreaterThan(longest(SHORT));
  });

  it("leaves a line the document already set past the page edge alone until text is typed", () => {
    const { box, onWrap } = renderRun(LONG);
    expect(parseFloat(box.style.width)).toBeGreaterThanOrEqual(longest(LONG));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.blur(box);
    expect(onWrap).not.toHaveBeenCalled();
  });

  it("does not split a word too long for the page", () => {
    const word = "x".repeat(40);
    const { box, onWrap } = renderRun(SHORT);
    type(box, word);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onWrap).not.toHaveBeenCalled();
    expect(parseFloat(box.style.width)).toBeGreaterThanOrEqual(longest(word));
  });

  it("wraps on blur when the user leaves before the live wrap", () => {
    const { box, onWrap } = renderRun(SHORT);
    type(box, LONG);
    fireEvent.blur(box);
    expect(onWrap).toHaveBeenCalledOnce();
    expect(onWrap.mock.calls[0][0]).toBeCloseTo(PAGE_CAP, 3);
  });

  it("asks to keep clear of what lies below the new lines", () => {
    const { box, onWrap } = renderRun(SHORT);
    type(box, LONG);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onWrap.mock.calls[0][1]).toBe(true);
  });

  it("grows past the edge instead when the wrap has nowhere clear to go", () => {
    const { box, onWrap } = renderRun(SHORT, "grow", false);
    type(box, LONG);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onWrap).toHaveBeenCalledOnce();
    expect(parseFloat(box.style.width)).toBeGreaterThanOrEqual(longest(LONG));
    type(box, `${LONG} and more`);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.blur(box);
    expect(onWrap).toHaveBeenCalledOnce();
  });
});
