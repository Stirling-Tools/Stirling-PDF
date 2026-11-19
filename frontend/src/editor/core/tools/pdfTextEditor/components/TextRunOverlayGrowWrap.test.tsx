import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextRunOverlay } from "@editor/tools/pdfTextEditor/components/TextRunOverlay";
import {
  plainCaretOffset,
  readOverlayText,
} from "@editor/tools/pdfTextEditor/util/overlayPainter";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type {
  TextRunSnapshot,
  WidthMode,
} from "@editor/tools/pdfTextEditor/types";
import type { GrowEdge } from "@editor/tools/pdfTextEditor/util/growEdge";

const CHAR_PX = 6;
const longest = (text: string) =>
  Math.max(...text.split(/\r?\n/).map((l) => l.length)) * CHAR_PX;

// jsdom has no innerText setter, so the plain-text paint is spelled out with
// the <br>s a browser would make of it.
vi.mock(
  "@editor/tools/pdfTextEditor/util/overlayPainter",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    paintPlainText: (el: HTMLElement, text: string) =>
      el.replaceChildren(
        ...text
          .split("\n")
          .flatMap((line, i) => [
            ...(i > 0 ? [document.createElement("br")] : []),
            document.createTextNode(line),
          ]),
      ),
  }),
);

vi.mock(
  "@editor/tools/pdfTextEditor/util/textMetrics",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    measureFontMetrics: () => ({ ascent: 9, descent: 3 }),
    measureMaxLineWidth: (text: string) => longest(text),
    measureAdvancePx: (text: string) => text.length * CHAR_PX,
    measureLongestTokenWidth: (text: string) =>
      Math.max(0, ...text.split(/\s+/).map((w) => w.length)) * CHAR_PX,
  }),
);

// jsdom lays nothing out, so a range has no rects to read.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

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

/** Greedy word wrap at `widthPx`, turning the breaking space into a newline as the reflow does. */
function wrapText(text: string, widthPx: number): string {
  const perLine = Math.floor(widthPx / CHAR_PX);
  return text
    .split("\n")
    .map((line) => {
      const out: string[] = [];
      let rest = line;
      while (rest.length > perLine) {
        const cut = rest.lastIndexOf(" ", perLine);
        if (cut <= 0) break;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut + 1);
      }
      return [...out, rest].join("\n");
    })
    .join("\n");
}

type OnWrap = (
  maxWidthPt: number,
  keepClearBelow?: boolean,
) => string | null | void;

let editedTexts: string[] = [];

function Harness({
  text,
  widthMode,
  onWrap,
  growEdge,
}: {
  text: string;
  widthMode: WidthMode;
  onWrap: OnWrap;
  growEdge?: GrowEdge | null;
}) {
  const [current, setCurrent] = useState(text);
  const edit = (next: string) => {
    editedTexts.push(next);
    setCurrent(next);
  };
  return (
    <TextRunOverlay
      run={run(current)}
      pageHeight={792}
      pageWidth={PAGE_WIDTH}
      transform={DisplayTransform.identity(PAGE_WIDTH, 792)}
      scale={1}
      widthMode={widthMode}
      growEdge={growEdge}
      selected={false}
      onSelect={() => {}}
      onEdit={edit}
      onWrap={(width, keepClear) => {
        const result = onWrap(width, keepClear);
        if (typeof result === "string") setCurrent(result);
        return result;
      }}
    />
  );
}

function renderRun(
  text: string,
  widthMode: WidthMode = "grow",
  wraps: "refuse" | "wrap" | "ignore" = "ignore",
  growEdge: GrowEdge | null = null,
) {
  editedTexts = [];
  const onWrap = vi.fn((width: number, _keepClear?: boolean) => {
    if (wraps === "refuse") return null;
    if (wraps === "ignore") return undefined;
    return wrapText(lastEdit(), width);
  });
  render(
    <MantineProvider env="test">
      <Harness
        text={text}
        widthMode={widthMode}
        onWrap={onWrap}
        growEdge={growEdge}
      />
    </MantineProvider>,
  );
  const box = screen.getByTestId("pdf-editor-run-r1");
  act(() => {
    fireEvent.focus(box);
  });
  return { box, onWrap };
}

function lastEdit(): string {
  return editedTexts[editedTexts.length - 1] ?? "";
}

function type(box: HTMLElement, text: string): void {
  act(() => {
    box.textContent = text;
    window.getSelection()!.selectAllChildren(box);
    window.getSelection()!.collapseToEnd();
    fireEvent.input(box);
  });
}

/** Insert `ch` at the caret, as a keystroke does, and fire its input. */
function typeAtCaret(box: HTMLElement, ch: string): void {
  act(() => {
    const selection = window.getSelection()!;
    const node = selection.focusNode as Text;
    const offset = selection.focusOffset;
    node.insertData(offset, ch);
    selection.collapse(node, offset + ch.length);
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

  it("wraps on blur whatever is still past the edge", () => {
    const { box, onWrap } = renderRun(SHORT);
    type(box, LONG);
    onWrap.mockClear();
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
    const { box, onWrap } = renderRun(SHORT, "grow", "refuse");
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

describe("Wrapping as the user types", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("wraps on the keystroke that crosses the page edge, without waiting", () => {
    const { box, onWrap } = renderRun(SHORT);
    type(box, LONG);
    expect(onWrap).toHaveBeenCalledOnce();
  });

  it("draws the wrapped lines in the box at once, caret after the last letter typed", () => {
    const { box } = renderRun(SHORT, "grow", "wrap");
    type(box, LONG);
    const wrapped = wrapText(LONG, PAGE_CAP);
    expect(wrapped).toContain("\n");
    expect(readOverlayText(box)).toBe(wrapped);
    expect(plainCaretOffset(box)).toBe(wrapped.length);
  });

  it("keeps the break when typing goes on after it", () => {
    const { box } = renderRun(SHORT, "grow", "wrap");
    type(box, LONG);
    const wrapped = wrapText(LONG, PAGE_CAP);
    typeAtCaret(box, "s");
    expect(lastEdit()).toBe(`${wrapped}s`);
  });

  it("wraps in Wrap mode on the crossing keystroke too", () => {
    const { box, onWrap } = renderRun(SHORT, "wrap", "wrap");
    type(box, `${SHORT} and some more`);
    expect(onWrap).toHaveBeenCalledOnce();
    expect(readOverlayText(box)).toContain("\n");
  });

  it("leaves a space typed at the edge for the letter after it", () => {
    const fits = `${SHORT} ${"y".repeat(Math.floor(PAGE_CAP / CHAR_PX) - SHORT.length - 2)}`;
    const { box, onWrap } = renderRun(SHORT);
    type(box, `${fits}   `);
    expect(onWrap).not.toHaveBeenCalled();
    type(box, `${fits}   z`);
    expect(onWrap).toHaveBeenCalledOnce();
  });

  it("asks only about the line being typed on", () => {
    const { box, onWrap } = renderRun(SHORT, "wrap");
    type(box, `${LONG}\nshort`);
    expect(onWrap).not.toHaveBeenCalled();
  });

  it("does not ask again for a line the reflow left as it was until it grows", () => {
    const { box, onWrap } = renderRun(SHORT);
    type(box, LONG);
    type(box, LONG);
    expect(onWrap).toHaveBeenCalledOnce();
    type(box, `${LONG}s`);
    expect(onWrap).toHaveBeenCalledTimes(2);
  });

  it("waits for an IME composition to end before wrapping", () => {
    const { box, onWrap } = renderRun(SHORT, "grow", "wrap");
    act(() => {
      box.focus();
      fireEvent.compositionStart(box);
    });
    type(box, LONG);
    expect(onWrap).not.toHaveBeenCalled();
    act(() => {
      fireEvent.compositionEnd(box);
    });
    expect(onWrap).toHaveBeenCalledOnce();
    expect(readOverlayText(box)).toBe(wrapText(LONG, PAGE_CAP));
  });
});

describe("Grow mode beside other text", () => {
  const COLUMN_EDGE = LEFT + 100;
  const NEXT_COLUMN: GrowEdge = { side: "right", x: COLUMN_EDGE };

  it("wraps text typed up to the next column at that column, not the page edge", () => {
    const { box, onWrap } = renderRun(SHORT, "grow", "wrap", NEXT_COLUMN);
    type(box, LONG);
    expect(onWrap).toHaveBeenCalledOnce();
    expect(onWrap.mock.calls[0][0]).toBeCloseTo(COLUMN_EDGE - LEFT, 3);
    expect(onWrap.mock.calls[0][1]).toBe(true);
    expect(readOverlayText(box)).toBe(wrapText(LONG, COLUMN_EDGE - LEFT));
  });

  it("stops the box short of the next column while the user types", () => {
    const { box } = renderRun(SHORT, "grow", "ignore", NEXT_COLUMN);
    type(box, LONG);
    expect(parseFloat(box.style.width)).toBeLessThanOrEqual(COLUMN_EDGE - LEFT);
  });

  it("wraps on blur at the next column too", () => {
    const { box, onWrap } = renderRun(SHORT, "grow", "ignore", NEXT_COLUMN);
    type(box, LONG);
    onWrap.mockClear();
    fireEvent.blur(box);
    expect(onWrap).toHaveBeenCalledOnce();
    expect(onWrap.mock.calls[0][0]).toBeCloseTo(COLUMN_EDGE - LEFT, 3);
  });

  it("measures right-to-left text from its right end to the text on its left", () => {
    const rtl = "שלום עולם";
    const edge: GrowEdge = { side: "left", x: LEFT - 40 };
    const { box, onWrap } = renderRun(rtl, "grow", "ignore", edge);
    type(box, `${rtl} ${"מילה ".repeat(30)}`);
    expect(onWrap).toHaveBeenCalledOnce();
    expect(onWrap.mock.calls[0][0]).toBeCloseTo(longest(rtl) + 40, 3);
  });

  it("keeps the page edge when the next column is past it", () => {
    const { box, onWrap } = renderRun(SHORT, "grow", "ignore", {
      side: "right",
      x: PAGE_WIDTH + 50,
    });
    type(box, LONG);
    expect(onWrap.mock.calls[0][0]).toBeCloseTo(PAGE_CAP, 3);
  });
});
