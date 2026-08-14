import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  isLinePainted,
  type PaintLine,
  paintLines,
  paintPlainText,
  plainCaretOffset,
  restoreCaretOffset,
} from "@app/tools/pdfTextEditor/v2/util/overlayPainter";

const OPTS = { font: "normal 400 16px sans-serif", fontSizePx: 16 };

function line(text: string, marginTopPx = 0): PaintLine {
  const tokens = text
    .split(/( +)/)
    .filter((t) => t.length > 0)
    .map((t) => ({ text: t, advancePx: 10 * t.length }));
  return { tokens, heightPx: 20, marginTopPx, marginLeftPx: 0 };
}

function host(): HTMLDivElement {
  const el = document.createElement("div");
  el.contentEditable = "true";
  document.body.appendChild(el);
  return el;
}

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: "",
    letterSpacing: "0px",
    measureText: (text: string) => ({
      width: text.length * 8,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 4,
    }),
  })) as unknown as HTMLCanvasElement["getContext"];
});

beforeEach(() => {
  document.body.replaceChildren();
});

describe("paintLines", () => {
  it("emits one block per line", () => {
    const el = host();
    paintLines(el, [line("Hello world"), line("second line")], OPTS);
    expect(el.children).toHaveLength(2);
    expect(isLinePainted(el)).toBe(true);
  });

  it("reads back the same text innerText would give", () => {
    const el = host();
    paintLines(el, [line("Hello world"), line("second line")], OPTS);
    expect(el.textContent).toBe("Hello worldsecond line");
    expect(el.children[0].textContent).toBe("Hello world");
    expect(el.children[1].textContent).toBe("second line");
  });

  it("gives an empty line a break so it still counts as a line", () => {
    const el = host();
    paintLines(el, [line("a"), line(""), line("b")], OPTS);
    expect(el.children).toHaveLength(3);
    expect(el.children[1].querySelector("br")).not.toBeNull();
  });

  it("pins each line's own height and gap", () => {
    const el = host();
    paintLines(el, [line("a"), line("b", 7.25)], OPTS);
    const second = el.children[1] as HTMLElement;
    expect(second.style.height).toBe("20px");
    expect(second.style.lineHeight).toBe("20px");
    expect(second.style.marginTop).toBe("7.25px");
  });

  it("uses inline tokens, never inline-block", () => {
    const el = host();
    paintLines(el, [line("Hello world")], OPTS);
    const spans = el.querySelectorAll("span");
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      expect(span.style.display).toBe("");
    }
  });

  it("replaces a previous painting rather than appending to it", () => {
    const el = host();
    paintLines(el, [line("first")], OPTS);
    paintLines(el, [line("second"), line("third")], OPTS);
    expect(el.children).toHaveLength(2);
    expect(el.textContent).toBe("secondthird");
  });
});

describe("caret offsets", () => {
  it("counts one character per line boundary", () => {
    const el = host();
    paintLines(el, [line("Hello world"), line("second line")], OPTS);
    const secondLine = el.children[1];
    const textNode = secondLine.firstChild!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 4);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(plainCaretOffset(el)).toBe(16);
  });

  it("round-trips every offset across a repaint", () => {
    const el = host();
    const lines = [line("Hello world"), line("second line")];
    paintLines(el, lines, OPTS);
    const total = "Hello world\nsecond line".length;
    for (let offset = 0; offset <= total; offset += 1) {
      restoreCaretOffset(el, offset);
      expect(plainCaretOffset(el)).toBe(offset);
    }
  });

  it("round-trips through an empty line", () => {
    const el = host();
    paintLines(el, [line("a"), line(""), line("b")], OPTS);
    for (const offset of [0, 1, 2, 3]) {
      restoreCaretOffset(el, offset);
      expect(plainCaretOffset(el)).toBe(offset);
    }
  });

  it("works on plain text too, for runs the exact path cannot place", () => {
    const el = host();
    paintPlainText(el, "just one line");
    expect(isLinePainted(el)).toBe(false);
    el.textContent = "just one line";
    restoreCaretOffset(el, 5);
    expect(plainCaretOffset(el)).toBe(5);
  });

  it("clamps past the end instead of throwing", () => {
    const el = host();
    paintLines(el, [line("abc")], OPTS);
    restoreCaretOffset(el, 999);
    expect(plainCaretOffset(el)).toBe(3);
  });

  it("returns null when the caret is somewhere else entirely", () => {
    const el = host();
    paintLines(el, [line("abc")], OPTS);
    const outside = document.createElement("div");
    outside.textContent = "elsewhere";
    document.body.appendChild(outside);
    const range = document.createRange();
    range.setStart(outside.firstChild!, 2);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(plainCaretOffset(el)).toBeNull();
  });
});
