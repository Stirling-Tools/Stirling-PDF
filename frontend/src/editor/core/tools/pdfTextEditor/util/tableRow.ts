import type { PageRect } from "@editor/tools/pdfTextEditor/types";

/** How many blocks side by side on one line make a table row rather than a running header. */
const TABLE_ROW = 4;

/**
 * Whether `run` sits on one line with `cells` of the `alike` blocks on its
 * page, itself included, to be a cell of a table row. Blocks share a line
 * when their vertical middles are within half the shorter one's height.
 */
export function inTableRow<R extends { bounds: PageRect }>(
  run: R,
  page: readonly R[],
  alike: (other: R) => boolean = () => true,
  cells = TABLE_ROW,
): boolean {
  const middle = run.bounds.y + run.bounds.height / 2;
  let alongside = 0;
  for (const other of page) {
    if (other === run || !alike(other)) continue;
    const otherMiddle = other.bounds.y + other.bounds.height / 2;
    const reach = Math.min(run.bounds.height, other.bounds.height) / 2;
    if (Math.abs(otherMiddle - middle) <= reach) alongside++;
  }
  return alongside + 1 >= cells;
}
