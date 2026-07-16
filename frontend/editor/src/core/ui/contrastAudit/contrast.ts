// Pure colour maths — no DOM, no React.

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(value: string): Rgb {
  const n = value.match(/[\d.]+/g)?.map(Number) ?? [];
  // color-mix() resolves to `color(srgb r g b [/ a])` (0–1); rgb()/rgba() 0–255.
  const scale = value.trimStart().startsWith("color(") ? 255 : 1;
  return {
    r: (n[0] ?? 0) * scale,
    g: (n[1] ?? 0) * scale,
    b: (n[2] ?? 0) * scale,
    a: n[3] ?? 1,
  };
}

// Composite a (possibly translucent) foreground over an opaque background.
export function over(fg: Rgb, bg: Rgb): Rgb {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

export function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export const hex = ({ r, g, b }: Rgb) =>
  "#" +
  [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
