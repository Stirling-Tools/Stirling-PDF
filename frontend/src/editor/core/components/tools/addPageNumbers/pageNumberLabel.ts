import type { CSSProperties } from "react";
import type { AddPageNumbersParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";

/**
 * Mirrors the text and placement rules in PageNumbersController, so the preview
 * shows what the backend stamps, where it stamps it.
 */

const MARGIN_FACTORS: Record<AddPageNumbersParameters["customMargin"], number> =
  {
    small: 0.02,
    medium: 0.035,
    large: 0.05,
    "x-large": 0.075,
  };

const FONT_FAMILIES: Record<AddPageNumbersParameters["fontType"], string> = {
  Times: '"Times New Roman", Times, serif',
  Helvetica: "Helvetica, Arial, sans-serif",
  Courier: '"Courier New", Courier, monospace',
};

export interface PageNumberLabelValues {
  n: number;
  zeroPad: number;
  /** Unknown until a file is loaded; the variable then stays as typed. */
  total?: number;
  filename?: string;
}

export function formatPageNumberLabel(
  customText: string,
  { n, zeroPad, total, filename }: PageNumberLabelValues,
): string {
  const number = zeroPad > 0 ? String(n).padStart(zeroPad, "0") : String(n);
  // Replacer functions, so a "$" in a file name is not read as a pattern.
  let label = (customText || "{n}").replaceAll("{n}", () => number);
  if (total !== undefined) {
    label = label.replaceAll("{total}", () => String(total));
  }
  if (filename !== undefined) {
    label = label.replaceAll("{filename}", () => filename);
  }
  return label;
}

export function fileNameWithoutExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export interface PageNumberPlacement {
  horizontal: "left" | "center" | "right";
  vertical: "top" | "middle" | "bottom";
  /** Gap to the page edge, as a fraction of the page width (x) and height (y). */
  margin: number;
}

export function getPageNumberPlacement(
  position: number,
  customMargin: AddPageNumbersParameters["customMargin"],
): PageNumberPlacement {
  const pos = Math.max(1, Math.min(9, Math.round(position))) - 1;
  return {
    horizontal: (["left", "center", "right"] as const)[pos % 3],
    vertical: (["top", "middle", "bottom"] as const)[Math.floor(pos / 3)],
    margin: MARGIN_FACTORS[customMargin] ?? MARGIN_FACTORS.medium,
  };
}

/**
 * Absolute-position style for the label inside a box the page's shape. Wants
 * `line-height: 1` on the label.
 */
export function getPageNumberLabelStyle(
  { horizontal, vertical, margin }: PageNumberPlacement,
  fontType: AddPageNumbersParameters["fontType"],
  fontSizePx: number,
): CSSProperties {
  const inset = `${Number((margin * 100).toFixed(4))}%`;
  const style: CSSProperties = {
    fontFamily: FONT_FAMILIES[fontType] ?? FONT_FAMILIES.Helvetica,
    fontSize: `${fontSizePx}px`,
  };
  let translateX = "0";
  let translateY = "0";

  if (horizontal === "left") style.left = inset;
  else if (horizontal === "right") style.right = inset;
  else {
    style.left = "50%";
    translateX = "-50%";
  }

  if (vertical === "top") style.top = inset;
  // The backend puts the baseline on the margin, so descenders hang below it.
  else if (vertical === "bottom") style.bottom = `calc(${inset} - 0.24em)`;
  else {
    style.top = "50%";
    translateY = "-50%";
  }

  if (translateX !== "0" || translateY !== "0") {
    style.transform = `translate(${translateX}, ${translateY})`;
  }
  return style;
}
