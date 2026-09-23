import { describe, expect, it } from "vitest";

import { compareEntriesByVisualOrder } from "@app/components/viewer/commentsSidebarOrder";

function entry(id: string, x: number, y: number) {
  return {
    annotation: {
      object: {
        id,
        rect: { origin: { x, y }, size: { width: 50, height: 12 } },
      },
    },
  };
}

function ids(list: Array<{ annotation: { object: { id: string } } }>): string {
  return list.map((e) => e.annotation.object.id).join(",");
}

describe("compareEntriesByVisualOrder", () => {
  it("sorts a scrambled page back into top-to-bottom / left-to-right reading order", () => {
    // EmbedPDF rects are viewport (top-left origin, y grows downward).
    // Reading order on the page: A (top-left) → B (top-right, same row)
    // → C (middle) → D (bottom). Storage order is D, C, A, B.
    const A = entry("A", 100, 100);
    const B = entry("B", 400, 100);
    const C = entry("C", 100, 250);
    const D = entry("D", 100, 400);
    const out = [D, C, A, B].sort(compareEntriesByVisualOrder);
    expect(ids(out)).toBe("A,B,C,D");
  });

  it("sorts entries on the same row by x ascending", () => {
    const left = entry("L", 100, 200);
    const mid = entry("M", 250, 200);
    const right = entry("R", 400, 200);
    const out = [right, left, mid].sort(compareEntriesByVisualOrder);
    expect(ids(out)).toBe("L,M,R");
  });

  it("treats sub-pixel y differences as the same row", () => {
    // Two annotations whose y differs by less than the SAME_ROW_EPSILON_PX
    // tolerance should tie-break by x, not by the noisy y.
    const a = entry("a", 100, 100.0);
    const b = entry("b", 400, 100.3);
    const out = [b, a].sort(compareEntriesByVisualOrder);
    expect(ids(out)).toBe("a,b");
  });

  it("places entries without a rect at the end and preserves their order", () => {
    const A = entry("A", 100, 100);
    const D = entry("D", 100, 400);
    const noRectX = { annotation: { object: { id: "X" } } };
    const noRectY = { annotation: { object: { id: "Y" } } };
    const out = [noRectX, A, noRectY, D].sort(compareEntriesByVisualOrder);
    expect(ids(out)).toBe("A,D,X,Y");
  });

  it("returns 0 when both entries are missing a rect", () => {
    const noRectX = { annotation: { object: { id: "X" } } };
    const noRectY = { annotation: { object: { id: "Y" } } };
    expect(compareEntriesByVisualOrder(noRectX, noRectY)).toBe(0);
    expect(compareEntriesByVisualOrder(noRectY, noRectX)).toBe(0);
  });

  it("treats a missing rect origin as { x: 0, y: 0 }", () => {
    const noOrigin = {
      annotation: { object: { id: "noOrigin", rect: {} } },
    } as unknown as ReturnType<typeof entry>;
    const farDown = entry("farDown", 0, 999);
    const out = [farDown, noOrigin].sort(compareEntriesByVisualOrder);
    expect(ids(out)).toBe("noOrigin,farDown");
  });

  it("handles the multi-page case by sorting each page independently", () => {
    // Simulates the byPage useMemo: each page is sorted on its own array.
    const pages: Record<number, ReturnType<typeof entry>[]> = {
      1: [
        entry("p1-D", 100, 400),
        entry("p1-B", 400, 100),
        entry("p1-C", 100, 250),
        entry("p1-A", 100, 100),
      ],
      2: [
        entry("p2-B", 400, 100),
        entry("p2-A", 100, 100),
        entry("p2-C", 100, 250),
      ],
      3: [entry("p3-A", 100, 100)],
    };
    const sorted: Record<number, string> = {};
    for (const [page, entries] of Object.entries(pages)) {
      sorted[Number(page)] = ids(entries.sort(compareEntriesByVisualOrder));
    }
    expect(sorted).toEqual({
      1: "p1-A,p1-B,p1-C,p1-D",
      2: "p2-A,p2-B,p2-C",
      3: "p3-A",
    });
  });
});
