/** Distinct colours for telling files or participants apart, indexed in order. */
export const FILE_COLORS = [
  // Subtle colors (1-6) - fit well with UI theme
  "rgb(59, 130, 246)", // Blue
  "rgb(16, 185, 129)", // Green
  "rgb(139, 92, 246)", // Purple
  "rgb(6, 182, 212)", // Cyan
  "rgb(20, 184, 166)", // Teal
  "rgb(99, 102, 241)", // Indigo

  // Mid-range colors (7-12) - more distinct
  "rgb(244, 114, 182)", // Pink
  "rgb(251, 146, 60)", // Orange
  "rgb(234, 179, 8)", // Yellow
  "rgb(132, 204, 22)", // Lime
  "rgb(248, 113, 113)", // Red
  "rgb(168, 85, 247)", // Violet

  // Vibrant colors (13-20) - maximum distinction
  "rgb(236, 72, 153)", // Fuchsia
  "rgb(245, 158, 11)", // Amber
  "rgb(34, 197, 94)", // Emerald
  "rgb(14, 165, 233)", // Sky
  "rgb(239, 68, 68)", // Rose
  "rgb(168, 162, 158)", // Stone
  "rgb(251, 191, 36)", // Gold
  "rgb(192, 132, 252)", // Light Purple
] as const;

/** Falls back to the first colour for an index past the palette. */
export function getFileColor(index: number): string {
  if (index < 0 || index >= FILE_COLORS.length) {
    console.warn(`File index ${index} out of range, using default color`);
    return FILE_COLORS[0];
  }
  return FILE_COLORS[index];
}
