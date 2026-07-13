import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "@portal/components/sources/Sparkline";

function pointsOf(container: HTMLElement): string[] {
  const poly = container.querySelector("polyline");
  return (poly?.getAttribute("points") ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

describe("Sparkline", () => {
  it("draws one point per value", () => {
    const { container } = render(<Sparkline data={[1, 5, 2, 8, 3]} />);
    expect(pointsOf(container)).toHaveLength(5);
  });

  it("renders nothing for an empty series", () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders a flat finite line for an all-zero series (no divide-by-zero)", () => {
    const { container } = render(<Sparkline data={[0, 0, 0, 0]} />);
    const ys = pointsOf(container).map((p) => Number(p.split(",")[1]));
    expect(ys).toHaveLength(4);
    expect(ys.every(Number.isFinite)).toBe(true);
    // All equal: a zero series is a single horizontal line, not NaN-laden.
    expect(new Set(ys).size).toBe(1);
  });

  it("puts the peak value at the top of the band", () => {
    const { container } = render(<Sparkline data={[0, 10]} height={36} />);
    const ys = pointsOf(container).map((p) => Number(p.split(",")[1]));
    // y grows downward in SVG, so the larger value (10) sits at the smaller y.
    expect(ys[1]).toBeLessThan(ys[0]);
  });

  it("exposes its aria-label", () => {
    const { container } = render(
      <Sparkline data={[1, 2]} ariaLabel="Docs trend" />,
    );
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(
      "Docs trend",
    );
  });
});
