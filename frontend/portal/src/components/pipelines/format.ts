/** Fraction → percentage string (0.004 → "0.40%"). */
export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/** Compact count for dense metric tiles (28941 → "28.9K"). */
export const compact = (n: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
