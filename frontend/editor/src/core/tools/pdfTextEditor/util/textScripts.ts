// Read-time classification of run text, so the editor can lock what it cannot
// round-trip instead of silently reordering or dropping it.

export type RunTextClass = "undecodable" | "rtl" | "pua" | "plain";

/** Unicode private-use areas. These carry a code but no standard glyph name. */
export function isPrivateUse(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

// Major RTL blocks. Bidi reordering is a layout transform this editor does not
// reproduce on re-emit, so RTL runs are locked at read time.
export function isRtlChar(cp: number): boolean {
  return (
    (cp >= 0x0590 && cp <= 0x05ff) || // Hebrew
    (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
    (cp >= 0x0700 && cp <= 0x074f) || // Syriac
    (cp >= 0x0750 && cp <= 0x077f) || // Arabic Supplement
    (cp >= 0x07c0 && cp <= 0x08ff) || // NKo .. Arabic Extended-A
    (cp >= 0xfb1d && cp <= 0xfdff) || // Hebrew/Arabic presentation forms
    (cp >= 0xfe70 && cp <= 0xfeff) || // Arabic presentation forms B
    (cp >= 0x10800 && cp <= 0x10fff) // ancient RTL scripts
  );
}

/** U+FFFD is PDFium's undecodable placeholder; controls have no glyph. */
export function isUndecodableChar(cp: number): boolean {
  return cp === 0xfffd || cp === 0;
}

/**
 * Classify a run's text. Undecodable wins over RTL wins over PUA: the first
 * means glyphs cannot be trusted at all, the second means layout cannot be
 * reproduced, the third is a normal editing case (charcodes are preserved).
 */
export function classifyRunText(text: string): RunTextClass {
  let rtl = false;
  let pua = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isUndecodableChar(cp)) return "undecodable";
    if (isRtlChar(cp)) rtl = true;
    else if (isPrivateUse(cp)) pua = true;
  }
  if (rtl) return "rtl";
  if (pua) return "pua";
  return "plain";
}
