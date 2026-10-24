import { afterEach, describe, expect, it, vi } from "vitest";
import { translatedBy } from "@editor/hooks/tools/useToolPanelGeometry";

/**
 * Builds an element chain outside-in from the given transforms and returns the
 * innermost element; untransformed ancestors read as `none`.
 */
function chain(transforms: string[]): Element {
  let node = document.createElement("div");
  const applied = new Map<Element, string>([[node, transforms[0] ?? "none"]]);
  for (let i = 1; i < transforms.length; i++) {
    const child = document.createElement("div");
    node.appendChild(child);
    applied.set(child, transforms[i]);
    node = child;
  }
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (el: Element) =>
      ({
        transform: applied.get(el) ?? "none",
      }) as unknown as CSSStyleDeclaration,
  );
  return node;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("translatedBy", () => {
  it("sums the element's own translate with its ancestors'", () => {
    // The wings slide the sidebar's wrapper (.workspace-frame), not the sidebar.
    const target = chain([
      "matrix(1, 0, 0, 1, -260, 0)",
      "matrix(1, 0, 0, 1, 296, 0)",
    ]);
    expect(translatedBy(target)).toEqual({ x: 36, y: 0 });
  });

  it("reads tx/ty from a matrix3d transform", () => {
    const target = chain([
      "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 48, -12, 0, 1)",
    ]);
    expect(translatedBy(target)).toEqual({ x: 48, y: -12 });
  });

  it("ignores untransformed ancestors", () => {
    const target = chain(["none", "matrix(1, 0, 0, 1, 10, 20)", "none"]);
    expect(translatedBy(target)).toEqual({ x: 10, y: 20 });
  });

  it("is zero when nothing along the chain is transformed", () => {
    expect(translatedBy(chain(["none", "none"]))).toEqual({ x: 0, y: 0 });
  });
});
