/**
 * A gentle, deterministic 30-point daily series averaging ~`avg`/day, shaped by a sine wave so mock
 * and Storybook sparklines have something to draw. Shared so the mock handler and the source stories
 * stay in sync instead of each carrying their own copy of the formula.
 */
export function sampleDailySeries(avg: number): number[] {
  return Array.from({ length: 30 }, (_, i) =>
    Math.round(avg * (0.5 + Math.abs(Math.sin((i + 1) / 3)))),
  );
}
