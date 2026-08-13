import { describe, it, expect } from "vitest";
import {
  GuideStore,
  MIN_LABEL_SPACING_PX,
  MIN_TICK_SPACING_PX,
  guideToLine,
  lineToGuide,
  rulerTicks,
  snapToGuides,
} from "@app/tools/pdfTextEditor/v2/util/guides";
import type { Guide } from "@app/tools/pdfTextEditor/v2/util/guides";
import { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";

// Pure geometry, pinned hard: ticks must stay readable at every zoom and
// snapping must be deterministic - a flickering snap target is worse than none.

const ZOOMS = [
  0.05, 0.1, 0.17, 0.25, 0.33, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 8, 12,
  16, 24, 32, 48, 64,
];
const LENGTHS = [595.276, 841.89, 612, 792, 200, 1000.5, 2000];

function mkGuide(id: string, position: number): Guide {
  return { id, axis: "x", position };
}

/** True when `step` is a 1/2/5 x 10^n ladder value. */
function isLadderStep(step: number): boolean {
  const exponent = Math.floor(Math.log10(step) + 1e-9);
  const mantissa = step / Math.pow(10, exponent);
  return [1, 2, 5].some((m) => Math.abs(mantissa - m) < 1e-6);
}

function isMultiple(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

/** Tightest on-screen gap between neighbouring marks, Infinity when under two. */
function minGapPx(marks: Array<{ position: number }>, scale: number): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < marks.length; i += 1) {
    min = Math.min(min, (marks[i].position - marks[i - 1].position) * scale);
  }
  return min;
}

describe("rulerTicks", () => {
  it("returns nothing for degenerate lengths or scales", () => {
    for (const [length, scale] of [
      [0, 1],
      [-10, 1],
      [595, 0],
      [595, -1],
      [Number.NaN, 1],
      [595, Number.NaN],
      [Number.POSITIVE_INFINITY, 1],
      [595, Number.POSITIVE_INFINITY],
    ]) {
      expect(rulerTicks(length, scale)).toEqual({
        minorStep: 0,
        majorStep: 0,
        ticks: [],
      });
    }
  });

  it("never crowds ticks or labels below the readable pixel thresholds", () => {
    for (const scale of ZOOMS) {
      for (const length of LENGTHS) {
        const { minorStep, majorStep, ticks } = rulerTicks(length, scale);
        const where = `length=${length} scale=${scale}`;
        expect(minorStep * scale, where).toBeGreaterThanOrEqual(
          MIN_TICK_SPACING_PX,
        );
        expect(majorStep * scale, where).toBeGreaterThanOrEqual(
          MIN_LABEL_SPACING_PX,
        );
        // Measured on screen, not inferred from the step.
        expect(minGapPx(ticks, scale), where).toBeGreaterThanOrEqual(
          MIN_TICK_SPACING_PX - 1e-9,
        );
        expect(
          minGapPx(
            ticks.filter((t) => t.label !== null),
            scale,
          ),
          where,
        ).toBeGreaterThanOrEqual(MIN_LABEL_SPACING_PX - 1e-9);
      }
    }
  });

  it("keeps both steps on the 1/2/5 ladder with major a multiple of minor", () => {
    for (const scale of ZOOMS) {
      for (const length of LENGTHS) {
        const { minorStep, majorStep } = rulerTicks(length, scale);
        const where = `length=${length} scale=${scale}`;
        expect(isLadderStep(minorStep), `${where} minor=${minorStep}`).toBe(
          true,
        );
        expect(isLadderStep(majorStep), `${where} major=${majorStep}`).toBe(
          true,
        );
        const ratio = majorStep / minorStep;
        expect(Math.abs(ratio - Math.round(ratio)), where).toBeLessThan(1e-6);
        expect(ratio, where).toBeGreaterThan(1);
      }
    }
  });

  it("labelled ticks are a strict subset sitting on round major positions", () => {
    for (const scale of ZOOMS) {
      for (const length of LENGTHS) {
        const { majorStep, ticks } = rulerTicks(length, scale);
        const where = `length=${length} scale=${scale}`;
        const labelled = ticks.filter((t) => t.label !== null);
        expect(labelled.length, where).toBeGreaterThan(0);
        expect(labelled.length, where).toBeLessThan(ticks.length);
        const offRound = labelled.filter(
          (t) => !isMultiple(t.position, majorStep),
        );
        expect(
          offRound.map((t) => t.position),
          where,
        ).toEqual([]);
        // The label reads the position it sits on, not an index.
        const misread = labelled.filter(
          (t) => Math.abs(Number(t.label) - t.position) > 1e-6,
        );
        expect(
          misread.map((t) => t.label),
          where,
        ).toEqual([]);
        // `major` and `label` never disagree.
        const disagree = ticks.filter((t) => t.major !== (t.label !== null));
        expect(
          disagree.map((t) => t.position),
          where,
        ).toEqual([]);
      }
    }
  });

  it("covers the page from 0 to within one step of its length, strictly increasing", () => {
    for (const scale of ZOOMS) {
      for (const length of LENGTHS) {
        const { minorStep, ticks } = rulerTicks(length, scale);
        const where = `length=${length} scale=${scale}`;
        expect(ticks[0].position, where).toBe(0);
        expect(ticks[0].major, where).toBe(true);
        const last = ticks[ticks.length - 1];
        expect(last.position, where).toBeLessThanOrEqual(length + 1e-9);
        expect(length - last.position, where).toBeLessThan(minorStep);
        expect(minGapPx(ticks, 1), where).toBeGreaterThan(0);
      }
    }
  });

  it("pins the interval at the zoom levels the editor actually uses", () => {
    const cases: Array<[number, number, number]> = [
      [0.25, 50, 200],
      [0.5, 20, 100],
      [1, 10, 50],
      [1.5, 5, 50],
      [2, 5, 50],
      [4, 2, 20],
    ];
    for (const [scale, minorStep, majorStep] of cases) {
      const ticks = rulerTicks(595.276, scale);
      expect([scale, ticks.minorStep, ticks.majorStep]).toEqual([
        scale,
        minorStep,
        majorStep,
      ]);
    }
  });

  it("adds decimals to labels only when the major step is sub-point", () => {
    expect(rulerTicks(600, 1).ticks[0].label).toBe("0");
    const fine = rulerTicks(20, 200);
    expect(fine.majorStep).toBeLessThan(1);
    const labels = fine.ticks
      .filter((t) => t.label !== null)
      .slice(0, 3)
      .map((t) => t.label);
    expect(labels.every((l) => (l ?? "").includes("."))).toBe(true);
  });

  it("stays bounded on a huge page at extreme zoom", () => {
    const { ticks, minorStep } = rulerTicks(20000, 100);
    expect(ticks.length).toBeLessThanOrEqual(4001);
    // Widening the step, not truncating: the last tick still reaches the end.
    expect(20000 - ticks[ticks.length - 1].position).toBeLessThan(minorStep);
  });
});

describe("snapToGuides", () => {
  it("returns the value untouched when there are no guides", () => {
    expect(snapToGuides(120.5, [], 5)).toEqual({ value: 120.5, guide: null });
  });

  it("snaps inside the tolerance and leaves the value alone outside it", () => {
    const guides = [mkGuide("a", 100)];
    expect(snapToGuides(103, guides, 5)).toEqual({
      value: 100,
      guide: guides[0],
    });
    expect(snapToGuides(97, guides, 5)).toEqual({
      value: 100,
      guide: guides[0],
    });
    expect(snapToGuides(106, guides, 5)).toEqual({ value: 106, guide: null });
    expect(snapToGuides(94, guides, 5)).toEqual({ value: 94, guide: null });
  });

  it("treats the tolerance as inclusive", () => {
    const guides = [mkGuide("a", 100)];
    expect(snapToGuides(105, guides, 5).guide).toBe(guides[0]);
    expect(snapToGuides(105.000001, guides, 5).guide).toBeNull();
  });

  it("picks the nearest guide, not the first in range", () => {
    const guides = [mkGuide("a", 100), mkGuide("b", 108), mkGuide("c", 130)];
    expect(snapToGuides(107, guides, 10).guide?.id).toBe("b");
    expect(snapToGuides(102, guides, 10).guide?.id).toBe("a");
  });

  it("breaks an exact tie on the lower id whatever the array order", () => {
    const low = mkGuide("guide-000001", 90);
    const high = mkGuide("guide-000002", 110);
    expect(snapToGuides(100, [low, high], 20).guide?.id).toBe("guide-000001");
    expect(snapToGuides(100, [high, low], 20).guide?.id).toBe("guide-000001");
  });

  it("with a zero tolerance only an exact hit snaps", () => {
    const guides = [mkGuide("a", 100)];
    expect(snapToGuides(100, guides, 0).guide).toBe(guides[0]);
    expect(snapToGuides(100.0001, guides, 0).guide).toBeNull();
  });

  it("refuses to snap on a negative or non-finite tolerance", () => {
    const guides = [mkGuide("a", 100)];
    expect(snapToGuides(100, guides, -1)).toEqual({ value: 100, guide: null });
    expect(snapToGuides(100, guides, Number.NaN).guide).toBeNull();
  });

  it("ignores non-finite guide positions and values", () => {
    const guides = [mkGuide("a", Number.NaN), mkGuide("b", 100)];
    expect(snapToGuides(101, guides, 5).guide?.id).toBe("b");
    const nan = snapToGuides(Number.NaN, guides, 5);
    expect(Number.isNaN(nan.value)).toBe(true);
    expect(nan.guide).toBeNull();
  });
});

describe("guideToLine / lineToGuide", () => {
  const CROP = { cl: 36, cb: 72, cw: 540, ch: 720 };

  function mk(rotate: number): DisplayTransform {
    const { cl, cb, cw, ch } = CROP;
    const dw = rotate % 2 === 0 ? cw : ch;
    const dh = rotate % 2 === 0 ? ch : cw;
    return DisplayTransform.fromCropAndRotate(cl, cb, cw, ch, rotate, dw, dh);
  }

  it("maps axes straight through on an identity page", () => {
    const t = DisplayTransform.identity(600, 800);
    expect(guideToLine({ axis: "x", position: 120 }, t)).toEqual({
      orientation: "vertical",
      position: 120,
    });
    expect(guideToLine({ axis: "y", position: 300 }, t)).toEqual({
      orientation: "horizontal",
      position: 300,
    });
    expect(lineToGuide({ orientation: "vertical", position: 120 }, t)).toEqual({
      axis: "x",
      position: 120,
    });
  });

  it("shifts by the CropBox origin", () => {
    const t = mk(0);
    expect(guideToLine({ axis: "x", position: CROP.cl }, t).position).toBe(0);
    expect(lineToGuide({ orientation: "horizontal", position: 0 }, t)).toEqual({
      axis: "y",
      position: CROP.cb,
    });
  });

  it("swaps the drawn orientation on quarter-turned pages", () => {
    for (const rotate of [1, 3]) {
      const t = mk(rotate);
      expect(guideToLine({ axis: "x", position: 100 }, t).orientation).toBe(
        "horizontal",
      );
      expect(guideToLine({ axis: "y", position: 100 }, t).orientation).toBe(
        "vertical",
      );
    }
    for (const rotate of [0, 2]) {
      const t = mk(rotate);
      expect(guideToLine({ axis: "x", position: 100 }, t).orientation).toBe(
        "vertical",
      );
    }
  });

  it("round-trips for every rotation", () => {
    for (const rotate of [0, 1, 2, 3]) {
      const t = mk(rotate);
      for (const seed of [
        { axis: "x" as const, position: 100 },
        { axis: "y" as const, position: 400.25 },
      ]) {
        const back = lineToGuide(guideToLine(seed, t), t);
        expect(back.axis, `rotate=${rotate}`).toBe(seed.axis);
        expect(back.position, `rotate=${rotate}`).toBeCloseTo(seed.position, 6);
      }
    }
  });
});

describe("GuideStore", () => {
  it("adds guides per page with ids that sort in creation order", () => {
    const store = new GuideStore();
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const guide = store.add(0, "x", i * 10);
      expect(guide).not.toBeNull();
      if (guide) ids.push(guide.id);
    }
    expect(ids).toEqual([...ids].sort());
    expect(store.get(0)).toHaveLength(12);
    expect(store.get(1)).toEqual([]);
  });

  it("rejects a non-finite position", () => {
    const store = new GuideStore();
    expect(store.add(0, "x", Number.NaN)).toBeNull();
    expect(store.get(0)).toEqual([]);
  });

  it("replaces the array instead of mutating it on every change", () => {
    const store = new GuideStore();
    const guide = store.add(0, "y", 50);
    const before = store.get(0);
    store.move(0, guide?.id ?? "", 80);
    const after = store.get(0);
    expect(after).not.toBe(before);
    expect(before[0].position).toBe(50);
    expect(after[0].position).toBe(80);
  });

  it("notifies on add / move / remove / clear but not on no-ops", () => {
    const store = new GuideStore();
    const seen: Array<[number, number]> = [];
    store.subscribe((pageIndex, guides) =>
      seen.push([pageIndex, guides.length]),
    );
    const guide = store.add(2, "x", 10);
    const id = guide?.id ?? "";
    store.move(2, id, 10); // same position
    store.move(2, "nope", 40); // unknown id
    store.remove(2, "nope"); // unknown id
    store.clear(3); // page with no guides
    store.move(2, id, 40);
    store.remove(2, id);
    store.clear(2); // already empty
    expect(seen).toEqual([
      [2, 1],
      [2, 1],
      [2, 0],
    ]);
  });

  it("clears one page or every page", () => {
    const store = new GuideStore();
    store.add(0, "x", 10);
    store.add(1, "y", 20);
    store.clear(0);
    expect(store.get(0)).toEqual([]);
    expect(store.get(1)).toHaveLength(1);
    store.add(0, "x", 30);
    const pages: number[] = [];
    store.subscribe((pageIndex) => pages.push(pageIndex));
    store.clear();
    expect(pages.sort()).toEqual([0, 1]);
    expect(store.get(0)).toEqual([]);
    expect(store.get(1)).toEqual([]);
  });

  it("unsubscribes cleanly", () => {
    const store = new GuideStore();
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.add(0, "x", 10);
    off();
    store.add(0, "x", 20);
    expect(calls).toBe(1);
  });

  it("keeps notifying when one listener throws or unsubscribes another", () => {
    const store = new GuideStore();
    const calls: string[] = [];
    store.subscribe(() => {
      calls.push("first");
      off();
      throw new Error("boom");
    });
    const off = store.subscribe(() => calls.push("second"));
    store.subscribe(() => calls.push("third"));
    expect(() => store.add(0, "x", 10)).not.toThrow();
    expect(calls).toEqual(["first", "second", "third"]);
  });
});
