/**
 * The overlays sit inside EmbedPDF's <Rotate>, which applies
 * `matrix(a,b,c,d,e,f)` for (pageRotation + docRotation) % 4 quarter turns.
 * getBoundingClientRect reports the axis-aligned SCREEN box, so a pointer has to
 * be mapped back into the element's own un-rotated space. These cases are the
 * inverse of that matrix, derived from @embedpdf/plugin-rotate's getRotationMatrix.
 */
import { describe, it, expect } from "vitest";
import {
  getLocalPoint,
  isTextEntryTarget,
} from "@app/tools/formFill/usePageScale";

/** An element whose un-rotated box is w x h, as it appears on screen after `turns`. */
function rotatedElement(w: number, h: number, turns: number): HTMLElement {
  const swapped = turns === 1 || turns === 3;
  const rect = {
    left: 0,
    top: 0,
    width: swapped ? h : w,
    height: swapped ? w : h,
  };
  return {
    getBoundingClientRect: () => rect as DOMRect,
  } as unknown as HTMLElement;
}

/** Forward transform: local -> screen, straight from EmbedPDF's matrix. */
function toScreen(x: number, y: number, w: number, h: number, turns: number) {
  switch (turns) {
    case 1:
      return { clientX: h - y, clientY: x };
    case 2:
      return { clientX: w - x, clientY: h - y };
    case 3:
      return { clientX: y, clientY: w - x };
    default:
      return { clientX: x, clientY: y };
  }
}

describe("getLocalPoint", () => {
  const W = 400;
  const H = 600;
  const points = [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
    [123, 456],
  ];

  for (const turns of [0, 1, 2, 3]) {
    it(`inverts EmbedPDF's transform at ${turns} quarter turn(s)`, () => {
      const el = rotatedElement(W, H, turns);
      for (const [x, y] of points) {
        const local = getLocalPoint(toScreen(x, y, W, H, turns), el, turns);
        expect(local.x).toBeCloseTo(x, 5);
        expect(local.y).toBeCloseTo(y, 5);
      }
    });
  }

  it("treats rotation as quarter turns, not degrees", () => {
    // EmbedPDF's Rotation enum is Degree90 = 1; 90 would normalise to 2 and flip
    // the page the wrong way, so 90 and 1 must NOT agree.
    const el = rotatedElement(W, H, 1);
    const screen = toScreen(10, 20, W, H, 1);
    expect(getLocalPoint(screen, el, 1)).not.toEqual(
      getLocalPoint(screen, el, 90),
    );
  });

  it("normalises out-of-range and negative rotations", () => {
    const el = rotatedElement(W, H, 1);
    const screen = toScreen(10, 20, W, H, 1);
    expect(getLocalPoint(screen, el, 5)).toEqual(getLocalPoint(screen, el, 1));
    expect(getLocalPoint(screen, el, -3)).toEqual(getLocalPoint(screen, el, 1));
  });

  it("returns the origin when the element is gone", () => {
    expect(getLocalPoint({ clientX: 5, clientY: 5 }, null)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("isTextEntryTarget", () => {
  it("claims inputs, textareas, selects and contenteditable", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isTextEntryTarget(document.createElement(tag))).toBe(true);
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom does not implement isContentEditable, so assert on the real getter.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isTextEntryTarget(editable)).toBe(true);
  });

  it("leaves ordinary elements and non-elements alone", () => {
    expect(isTextEntryTarget(document.createElement("div"))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
    expect(isTextEntryTarget(new EventTarget())).toBe(false);
  });
});
