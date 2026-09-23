import { describe, expect, it } from "vitest";
import { radioOptionRects } from "@app/tools/formFill/formCoordinateUtils";

/**
 * These mirror FormUtilsRadioCaptionTest on the Java side. If the two layouts drift, the create
 * preview stops matching the PDF that gets written, which is the bug this rule was added to fix.
 */
describe("radioOptionRects", () => {
  it("fills exactly the drawn height", () => {
    const rows = radioOptionRects({ width: 100, height: 90 }, 3);
    expect(rows).toHaveLength(3);
    const extent = rows[2].top + rows[2].size - rows[0].top;
    expect(extent).toBeCloseTo(90, 5);
    expect(rows[0].top).toBe(0);
  });

  it("agrees with the backend for the default 3-option case", () => {
    // Java: size 22.5, gap 11.25 for a 100x90 box.
    const rows = radioOptionRects({ width: 100, height: 90 }, 3);
    expect(rows[0].size).toBeCloseTo(22.5, 5);
    expect(rows[1].top - (rows[0].top + rows[0].size)).toBeCloseTo(11.25, 5);
  });

  it("uses an explicit size and gap verbatim", () => {
    const rows = radioOptionRects({ width: 100, height: 90 }, 3, 20, 14);
    expect(rows.every((r) => r.size === 14)).toBe(true);
    expect(rows[1].top - (rows[0].top + rows[0].size)).toBeCloseTo(20, 5);
  });

  it("never lets an option exceed the box width", () => {
    const rows = radioOptionRects({ width: 8, height: 90 }, 3);
    expect(rows.every((r) => r.size <= 8)).toBe(true);
  });

  it("handles a single option", () => {
    const rows = radioOptionRects({ width: 40, height: 40 }, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].size).toBeLessThanOrEqual(40);
  });
});
