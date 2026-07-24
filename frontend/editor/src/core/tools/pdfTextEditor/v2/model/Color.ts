import type { RGBA } from "@app/tools/pdfTextEditor/v2/types";

export const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };
export const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 255 };

/** Parse a `#rrggbb`, `#rrggbbaa`, or `rgb(...)` string. Returns null on failure. */
export function parseCssColor(value: string): RGBA | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      if ([r, g, b, a].every((c) => Number.isFinite(c))) {
        return { r, g, b, a };
      }
    }
    return null;
  }
  const m = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i,
  );
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const a = m[4] === undefined ? 255 : Math.round(Number(m[4]) * 255);
    return { r, g, b, a };
  }
  return null;
}

/** Format an RGBA as `#rrggbb` (ignoring alpha). */
export function toCssHex(color: RGBA): string {
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

export function equalsRGBA(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}
