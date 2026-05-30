/**
 * Helpers for inspecting and flipping the bold/italic variants of the
 * PDF base-14 font families used by the toolbar.
 */

export function isBoldFamily(fontId: string): boolean {
  return /bold/i.test(fontId);
}

export function isItalicFamily(fontId: string): boolean {
  return /italic|oblique/i.test(fontId);
}

/** Strip any `prefix:` qualifier that `PdfiumTextReader` adds to font ids. */
export function familyOf(fontId: string): string {
  const idx = fontId.lastIndexOf(":");
  return idx >= 0 ? fontId.slice(idx + 1) : fontId;
}

/**
 * Map a base-14 family to its bold variant (or back to the regular one).
 * Returns null if the swap isn't representable in base-14.
 */
export function flipBold(currentFamily: string, on: boolean): string | null {
  if (/^Helvetica/.test(currentFamily)) {
    return on
      ? currentFamily.replace(/(-Bold)?$/, "-Bold")
      : currentFamily.replace(/-Bold$/, "");
  }
  if (/^Times/.test(currentFamily)) {
    return on
      ? currentFamily.replace(/-Roman$|$/, "-Bold")
      : currentFamily.replace(/-Bold$/, "-Roman");
  }
  if (/^Courier/.test(currentFamily)) {
    return on
      ? currentFamily.replace(/(-Bold)?$/, "-Bold")
      : currentFamily.replace(/-Bold$/, "");
  }
  return null;
}

export function flipItalic(currentFamily: string, on: boolean): string | null {
  if (/^Helvetica/.test(currentFamily)) {
    return on
      ? currentFamily.replace(/(-Oblique)?$/, "-Oblique")
      : currentFamily.replace(/-Oblique$/, "");
  }
  if (/^Times/.test(currentFamily)) {
    return on
      ? currentFamily.replace(/-Roman$|$/, "-Italic")
      : currentFamily.replace(/-Italic$/, "-Roman");
  }
  return null;
}
