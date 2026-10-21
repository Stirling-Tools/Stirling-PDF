// @vitest-environment node
import { describe, expect, test } from "vitest";
import { snapPoint, type SnapOptions } from "@app/utils/measurementSnapping";
import type { PagePoint } from "@app/utils/measurementTypes";

const pt = (x: number, y: number, pageIndex = 0): PagePoint => ({
  pageIndex,
  x,
  y,
});

// A horizontal line from (100, 100) to (300, 100), viewed at 100% zoom.
const options = (overrides: Partial<SnapOptions> = {}): SnapOptions => ({
  anchor: null,
  vertices: [pt(100, 100), pt(300, 100)],
  edges: [[pt(100, 100), pt(300, 100)]],
  pxToPage: 1,
  snapToPoints: true,
  snapToAngles: true,
  forceAngle: false,
  ...overrides,
});

describe("snapPoint", () => {
  test("lands on a nearby vertex", () => {
    const result = snapPoint(pt(104, 97), options());
    expect(result.point).toEqual(pt(100, 100));
    expect(result.vertex).toEqual(pt(100, 100));
  });

  test("aligns with a vertex's x before drawing starts", () => {
    const result = snapPoint(pt(103, 200), options());
    expect(result.point).toEqual(pt(100, 200));
    expect(result.guides).toEqual([
      { from: pt(100, 100), to: pt(100, 200), kind: "align" },
    ]);
  });

  test("snaps the segment to horizontal and slides it to line up", () => {
    // Drawing a second line under the first, starting below its left end.
    const result = snapPoint(pt(297, 204), options({ anchor: pt(100, 200) }));
    expect(result.point).toEqual(pt(300, 200));
    expect(result.guides.map((g) => g.kind)).toEqual(["angle", "align"]);
  });

  test("snaps to 45 degrees when close to the diagonal", () => {
    const result = snapPoint(
      pt(203, 197),
      options({ anchor: pt(150, 150), vertices: [] }),
    );
    expect(result.point.x).toBeCloseTo(200);
    expect(result.point.y).toBeCloseTo(200);
  });

  test("leaves free angles alone when far from any ray", () => {
    const raw = pt(220, 190);
    expect(
      snapPoint(raw, options({ anchor: pt(150, 150), vertices: [], edges: [] }))
        .point,
    ).toEqual(raw);
  });

  test("Shift locks to the nearest ray however far off it", () => {
    const result = snapPoint(
      pt(250, 180),
      options({ anchor: pt(150, 150), vertices: [], forceAngle: true }),
    );
    expect(result.point.y).toBeCloseTo(150);
  });

  test("falls back to the nearest point on an edge", () => {
    const result = snapPoint(
      pt(207, 105),
      options({ vertices: [], edges: [[pt(100, 100), pt(300, 100)]] }),
    );
    expect(result.point).toEqual(pt(207, 100));
  });

  test("ignores other pages and disabled snapping", () => {
    expect(snapPoint(pt(102, 101, 1), options()).point).toEqual(
      pt(102, 101, 1),
    );
    expect(
      snapPoint(
        pt(102, 101),
        options({ snapToPoints: false, snapToAngles: false }),
      ).point,
    ).toEqual(pt(102, 101));
  });

  test("scales thresholds with zoom", () => {
    // 9 page units is 4.5 px at 50% zoom (pxToPage 2), inside the snap radius.
    expect(snapPoint(pt(109, 100), options({ pxToPage: 2 })).vertex).toEqual(
      pt(100, 100),
    );
    expect(snapPoint(pt(109, 140), options({ pxToPage: 0.5 })).point).toEqual(
      pt(109, 140),
    );
  });
});
