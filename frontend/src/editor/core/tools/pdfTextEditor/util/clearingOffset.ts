export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * How far below its anchor a dropdown opens so it covers none of `keepVisible`,
 * or just `gap` when clearing them would push it past `viewportHeight`.
 */
export function offsetClearing(
  anchorBottom: number,
  dropdown: { left: number; right: number; height: number },
  keepVisible: Box[],
  gap: number,
  viewportHeight: number,
): number {
  let top = anchorBottom + gap;
  const sorted = [...keepVisible].sort((a, b) => a.top - b.top);
  for (const box of sorted) {
    if (box.right <= dropdown.left || box.left >= dropdown.right) continue;
    if (box.bottom <= top || box.top >= top + dropdown.height) continue;
    top = box.bottom + gap;
  }
  if (top + dropdown.height > viewportHeight) return gap;
  return top - anchorBottom;
}
