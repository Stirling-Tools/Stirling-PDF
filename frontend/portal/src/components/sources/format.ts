/** Format a 0..1 ratio as a one-decimal percentage, e.g. 0.962 → "96.2%". */
export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
