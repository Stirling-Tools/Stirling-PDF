/** How one column of a tree row is drawn: a branch passing by, this row's own branch, or nothing. */
export type TreeGuide = "line" | "tee" | "elbow" | "none";

/**
 * The guide columns for each heading, from its level (null for an unnumbered H,
 * placed as a top-level heading). A heading nests under the nearest heading before
 * it with a lower level, so one that skips a level still hangs off its parent.
 */
export function headingTreeGuides(
  levels: readonly (number | null)[],
): TreeGuide[][] {
  const depths = nestingDepths(levels);
  return depths.map((depth, row) =>
    Array.from({ length: depth }, (_, column): TreeGuide => {
      const continues = branchContinues(depths, row, column + 1);
      if (column === depth - 1) return continues ? "tee" : "elbow";
      return continues ? "line" : "none";
    }),
  );
}

function nestingDepths(levels: readonly (number | null)[]): number[] {
  const open: number[] = [];
  return levels.map((level) => {
    const at = level ?? 1;
    while (open.length > 0 && open[open.length - 1] >= at) open.pop();
    const depth = open.length;
    open.push(at);
    return depth;
  });
}

/** Whether a later row is another child at `depth` of the parent `row` sits under. */
function branchContinues(
  depths: readonly number[],
  row: number,
  depth: number,
): boolean {
  for (let next = row + 1; next < depths.length; next++) {
    if (depths[next] <= depth) return depths[next] === depth;
  }
  return false;
}
