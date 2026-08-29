import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  isLinePainted,
  type PaintLine,
  paintLines,
  paintPlainText,
  plainCaretOffset,
  readOverlayText,
  refitEditedTokens,
  restoreCaretOffset,
} from "@app/tools/pdfTextEditor/v2/util/overlayPainter";

const OPTS = { font: "normal 400 16px sans-serif", fontSizePx: 16 };

/** Line box geometry the advance tests do not care about. */
const BOX = { heightPx: 20, marginTopPx: 0, marginLeftPx: 0 };

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
    // A FIXED height, never minHeight. A painted block is one line of the PDF -
    // one text object at one pen origin - and the page cannot wrap it. Letting
    // the block grow put a long line on two rows in the overlay and one on the
    // page, pushing every block below it a full line-height out of register.
    expect(second.style.height).toBe("20px");
    expect(second.style.minHeight).toBe("");
    expect(second.style.lineHeight).toBe("20px");
    expect(second.style.marginTop).toBe("7.25px");
  });

  it("never lets a painted line wrap", () => {
    const el = host();
    paintLines(el, [line("a long line of text"), line("b")], OPTS);
    for (const block of el.children) {
      // "inherit" let the container's pre-wrap reach the blocks; the PDF has
      // no such thing as a soft break, so neither may these.
      expect((block as HTMLElement).style.whiteSpace).toBe("pre");
    }
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

describe("readOverlayText", () => {
  it("round-trips what paintLines wrote", () => {
    const el = host();
    paintLines(el, [line("Hello world"), line("second line")], OPTS);
    expect(readOverlayText(el)).toBe("Hello world\nsecond line");
  });

  // The browser leaves a filler <br> in a block the user emptied. innerText
  // reports that as "\n", which used to add a phantom line and push every
  // line below it one leading down the page.
  it("reads a block the browser emptied as ONE blank line", () => {
    const el = host();
    paintLines(el, [line("4 Park Plaza"), line("Suite 1930")], OPTS);
    const first = el.children[0] as HTMLElement;
    first.replaceChildren(document.createElement("br"));
    expect(readOverlayText(el)).toBe("\nSuite 1930");
  });

  it("keeps the line count when every block is emptied", () => {
    const el = host();
    paintLines(el, [line("a"), line("b"), line("c")], OPTS);
    for (const block of Array.from(el.children)) {
      block.replaceChildren(document.createElement("br"));
    }
    expect(readOverlayText(el)).toBe("\n\n");
  });

  it("keeps a blank first line in the plain <br> DOM", () => {
    const el = host();
    el.append(document.createElement("br"), document.createTextNode("abc"));
    expect(readOverlayText(el)).toBe("\nabc");
  });

  it("drops the browser's trailing filler <br>", () => {
    const el = host();
    el.append(document.createTextNode("abc"), document.createElement("br"));
    expect(readOverlayText(el)).toBe("abc");
  });

  it("reads a lone filler <br> as empty, not as a line break", () => {
    const el = host();
    el.appendChild(document.createElement("br"));
    expect(readOverlayText(el)).toBe("");
  });

  it("normalises non-breaking spaces the browser inserts", () => {
    const el = host();
    el.appendChild(document.createTextNode("a\u00A0b"));
    expect(readOverlayText(el)).toBe("a b");
  });
});

describe("readOverlayText - browser-emptied blocks", () => {
  // Chrome does not always leave a bare <br> behind. Pressing Enter at the end
  // of a line leaves the new block holding an EMPTY CLONE of the token span
  // with the filler <br> inside it - a break the walk must NOT read as a line
  // of its own, or one Enter reads back as two.
  it("reads a block emptied down to a token span as ONE blank line", () => {
    const el = host();
    paintLines(el, [line("Second line"), line("left margin")], OPTS);
    const emptied = el.children[0] as HTMLElement;
    const leftover = document.createElement("span");
    leftover.setAttribute("data-v2-token", "");
    leftover.dataset.src = "line";
    leftover.appendChild(document.createElement("br"));
    emptied.replaceChildren(leftover);
    expect(readOverlayText(el)).toBe("\nleft margin");
  });

  it("still splits a block that really does hold two lines", () => {
    const el = host();
    paintLines(el, [line("one two")], OPTS);
    const block = el.children[0] as HTMLElement;
    // Firefox spells a manual break as a <br> INSIDE the token span it split,
    // so the reader has to descend to see it.
    const span = document.createElement("span");
    span.setAttribute("data-v2-token", "");
    span.replaceChildren(
      document.createTextNode("one"),
      document.createElement("br"),
      document.createTextNode("two"),
    );
    block.replaceChildren(span);
    expect(readOverlayText(el)).toBe("one\ntwo");
  });
});

describe("plainCaretOffset - carets that are not in a text node", () => {
  // Enter parks the caret inside the empty span Chrome left behind. A tree walk
  // over text nodes alone reports nothing for that position, and the repaint
  // that follows then dropped the caret to the top of the run.
  it("finds a caret parked inside an empty token span", () => {
    const el = host();
    paintLines(el, [line("Second line"), line(""), line("left margin")], OPTS);
    const blank = el.children[1] as HTMLElement;
    const leftover = document.createElement("span");
    leftover.setAttribute("data-v2-token", "");
    blank.replaceChildren(leftover);

    const range = document.createRange();
    range.setStart(leftover, 0);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    expect(plainCaretOffset(el)).toBe("Second line\n".length);
  });

  it("finds a caret parked on the container between two blocks", () => {
    const el = host();
    paintLines(el, [line("abc"), line("de")], OPTS);
    const range = document.createRange();
    range.setStart(el, 1);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(plainCaretOffset(el)).toBe(4);
  });

  it("reads a container caret past the last block as the end of it", () => {
    const el = host();
    paintLines(el, [line("abc"), line("de")], OPTS);
    const range = document.createRange();
    range.setStart(el, 2);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(plainCaretOffset(el)).toBe("abc\nde".length);
  });
});

describe("refitEditedTokens", () => {
  // The stub canvas above advances every face at 8px/char, so a token painted
  // at a different advance is standing in for a PDF whose own face is wider or
  // narrower than the one the browser has.
  function tokenOf(el: HTMLElement): HTMLElement {
    return el.querySelector<HTMLElement>("[data-v2-token]")!;
  }

  function fittedWidth(span: HTMLElement, chars: number): number {
    const ls = parseFloat(span.style.letterSpacing || "0");
    const mr = parseFloat(span.style.marginRight || "0");
    return chars * 8 + chars * ls + mr;
  }

  it("re-prices a token the user typed into against the PDF's own advances", () => {
    const el = host();
    paintLines(el, [{ tokens: [{ text: "ab", advancePx: 24 }], ...BOX }], OPTS);
    const span = tokenOf(el);
    span.textContent = "abcd";
    // "a" and "b" measured 12px each in the PDF; "c"/"d" are new, so they take
    // the token's own browser-to-PDF ratio (24/16).
    refitEditedTokens(el, {
      ...OPTS,
      advanceEm: new Map([
        ["a", 12 / OPTS.fontSizePx],
        ["b", 12 / OPTS.fontSizePx],
      ]),
    });
    expect(fittedWidth(span, 4)).toBeCloseTo(48, 4);
  });

  it("falls back to the token's own ratio with no advance table", () => {
    const el = host();
    paintLines(el, [{ tokens: [{ text: "ab", advancePx: 24 }], ...BOX }], OPTS);
    const span = tokenOf(el);
    span.textContent = "abcd";
    refitEditedTokens(el, OPTS);
    expect(fittedWidth(span, 4)).toBeCloseTo(48, 4);
  });

  it("restores the exact fit when the edit is backspaced away", () => {
    const el = host();
    paintLines(el, [{ tokens: [{ text: "ab", advancePx: 24 }], ...BOX }], OPTS);
    const span = tokenOf(el);
    const painted = `${span.style.letterSpacing}|${span.style.marginRight}`;
    span.textContent = "abcd";
    refitEditedTokens(el, OPTS);
    span.textContent = "ab";
    refitEditedTokens(el, OPTS);
    expect(`${span.style.letterSpacing}|${span.style.marginRight}`).toBe(
      painted,
    );
  });

  it("leaves untouched tokens exactly as painted", () => {
    const el = host();
    paintLines(el, [{ tokens: [{ text: "ab", advancePx: 24 }], ...BOX }], OPTS);
    const span = tokenOf(el);
    const before = `${span.style.letterSpacing}|${span.style.marginRight}`;
    refitEditedTokens(el, OPTS);
    expect(`${span.style.letterSpacing}|${span.style.marginRight}`).toBe(
      before,
    );
  });
});
