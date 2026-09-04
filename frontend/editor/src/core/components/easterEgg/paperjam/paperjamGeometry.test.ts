import { describe, expect, it } from "vitest";
import {
  type Box,
  type Quad,
  lerpPose,
  logoPose,
  paddlePose,
} from "@app/components/easterEgg/paperjam/paperjamGeometry";

const spanX = (quad: Quad) => ({
  min: Math.min(...quad.map((p) => p.x)),
  max: Math.max(...quad.map((p) => p.x)),
});
const spanY = (quad: Quad) => ({
  min: Math.min(...quad.map((p) => p.y)),
  max: Math.max(...quad.map((p) => p.y)),
});

/** Opposite sides equal and parallel - the property the corner tween relies on. */
function isParallelogram(quad: Quad): boolean {
  const [tl, tr, br, bl] = quad;
  return (
    Math.abs(tr.x - tl.x - (br.x - bl.x)) < 1e-9 &&
    Math.abs(tr.y - tl.y - (br.y - bl.y)) < 1e-9
  );
}

const PADDLE: Box = { x: 100, y: 500, w: 132, h: 16 };

describe("paddlePose", () => {
  it("fills the collision box exactly, so the ball hits what is drawn", () => {
    const { a, b } = paddlePose(PADDLE);
    expect(spanX(a).min).toBeCloseTo(PADDLE.x);
    expect(spanX(b).max).toBeCloseTo(PADDLE.x + PADDLE.w);
    for (const piece of [a, b]) {
      expect(spanY(piece).min).toBeCloseTo(PADDLE.y);
      expect(spanY(piece).max).toBeCloseTo(PADDLE.y + PADDLE.h);
    }
  });

  it("leaves a gap between the two pieces rather than overlapping them", () => {
    const { a, b } = paddlePose(PADDLE);
    // Compared along the bottom edge, where both pieces start unskewed.
    const gap = b[3].x - a[2].x;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(PADDLE.w / 4);
  });

  it("draws both pieces as parallelograms", () => {
    const { a, b } = paddlePose(PADDLE);
    expect(isParallelogram(a)).toBe(true);
    expect(isParallelogram(b)).toBe(true);
  });

  it("tracks the box as the paddle moves", () => {
    const moved = paddlePose({ ...PADDLE, x: PADDLE.x + 40 });
    expect(spanX(moved.a).min).toBeCloseTo(PADDLE.x + 40);
  });
});

describe("logoPose", () => {
  it("keeps the mark inside the box and preserves its aspect ratio", () => {
    const box: Box = { x: 10, y: 20, w: 64, h: 64 };
    const { a, b } = logoPose(box);
    for (const piece of [a, b]) {
      expect(spanX(piece).min).toBeGreaterThanOrEqual(box.x - 1e-9);
      expect(spanX(piece).max).toBeLessThanOrEqual(box.x + box.w + 1e-9);
      expect(spanY(piece).min).toBeGreaterThanOrEqual(box.y - 1e-9);
      expect(spanY(piece).max).toBeLessThanOrEqual(box.y + box.h + 1e-9);
      expect(isParallelogram(piece)).toBe(true);
    }
    // The mark is taller than it is wide, so a square box letterboxes sideways.
    expect(spanX(b).max - spanX(a).min).toBeLessThan(box.w);
    expect(spanY(a).max - spanY(a).min).toBeGreaterThan(0);
  });
});

describe("lerpPose", () => {
  const from = logoPose({ x: 0, y: 0, w: 40, h: 44 });
  const to = paddlePose(PADDLE);

  it("returns the endpoints unchanged at t=0 and t=1", () => {
    expect(lerpPose(from, to, 0)).toEqual(from);
    expect(lerpPose(from, to, 1)).toEqual(to);
  });

  it("stays a parallelogram all the way through the morph", () => {
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const mid = lerpPose(from, to, t);
      expect(isParallelogram(mid.a)).toBe(true);
      expect(isParallelogram(mid.b)).toBe(true);
    }
  });

  it("moves monotonically towards the paddle", () => {
    const early = lerpPose(from, to, 0.25).a[0];
    const late = lerpPose(from, to, 0.75).a[0];
    const target = to.a[0];
    expect(Math.abs(late.y - target.y)).toBeLessThan(
      Math.abs(early.y - target.y),
    );
  });
});
