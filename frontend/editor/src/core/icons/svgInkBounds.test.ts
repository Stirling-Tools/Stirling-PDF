import { describe, expect, it } from "vitest";

import { inkBounds, parseTransform } from "@app/icons/svgInkBounds";
import type { IconNode } from "@app/icons/types";

const close = (box: ReturnType<typeof inkBounds>, expected: number[]) => {
  expect(box).not.toBeNull();
  const { minX, minY, maxX, maxY } = box!;
  [minX, minY, maxX, maxY].forEach((v, i) =>
    expect(v).toBeCloseTo(expected[i], 2),
  );
};

describe("inkBounds", () => {
  it("measures primitives", () => {
    close(
      inkBounds([["rect", { x: "2", y: "3", width: "10", height: "4" }]]),
      [2, 3, 12, 7],
    );
    close(
      inkBounds([["circle", { cx: "12", cy: "12", r: "5" }]]),
      [7, 7, 17, 17],
    );
    close(
      inkBounds([["ellipse", { cx: "12", cy: "4.5", rx: "6.8", ry: "2.1" }]]),
      [5.2, 2.4, 18.8, 6.6],
    );
    close(
      inkBounds([["line", { x1: "1", y1: "9", x2: "5", y2: "2" }]]),
      [1, 2, 5, 9],
    );
  });

  it("measures path segments, including relative and shorthand commands", () => {
    close(inkBounds([["path", { d: "M2 2h20v20H2z" }]]), [2, 2, 22, 22]);
    // A cubic that bows above its endpoints peaks at y = 0.25 * (2*3 + ...) = 2.5 - 0.75*... sampled.
    close(
      inkBounds([["path", { d: "M0 10C0 0 10 0 10 10" }]]),
      [0, 2.5, 10, 10],
    );
    // Two half circles drawn with arcs (glued flags) enclose a full circle.
    close(
      inkBounds([["path", { d: "M2 12a10 10 0 0120 0a10 10 0 01-20 0" }]]),
      [2, 2, 22, 22],
    );
  });

  // A circle exported as one arc back to its own start draws nothing, and must not NaN the box.
  it("ignores an arc whose endpoints coincide, as a renderer does", () => {
    close(
      inkBounds([["path", { d: "M4 4h6M12 2a10 10 0 1 0 0 0" }]]),
      [4, 2, 12, 4],
    );
  });

  it("rounds rect corners instead of measuring their sharp corners under rotation", () => {
    const sharp = inkBounds([
      [
        "rect",
        {
          x: "10.6",
          y: "2.5",
          width: "2.8",
          height: "19",
          transform: "rotate(45 12 12)",
        },
      ],
    ]);
    const rounded = inkBounds([
      [
        "rect",
        {
          x: "10.6",
          y: "2.5",
          width: "2.8",
          height: "19",
          rx: "1.4",
          transform: "rotate(45 12 12)",
        },
      ],
    ]);
    expect(rounded!.maxX).toBeLessThan(sharp!.maxX - 0.3);
  });

  it("applies nested transforms and inherited strokes", () => {
    const nodes: IconNode[] = [
      [
        "g",
        {
          transform: "translate(2 2) scale(0.5)",
          stroke: "#000",
          strokeWidth: "2",
        },
        [["rect", { x: "0", y: "0", width: "20", height: "20" }]],
      ],
    ];
    close(inkBounds(nodes), [1.5, 1.5, 12.5, 12.5]);
    close(inkBounds(nodes, { stroke: false }), [2, 2, 12, 12]);
  });

  it("returns null for a fragment that paints nothing", () => {
    expect(inkBounds([["defs", {}, [["path", { d: "M0 0h9" }]]]])).toBeNull();
  });

  it("parses transform lists in order", () => {
    expect(parseTransform("translate(2 2) scale(0.8333)")).toEqual([
      0.8333, 0, 0, 0.8333, 2, 2,
    ]);
  });
});
