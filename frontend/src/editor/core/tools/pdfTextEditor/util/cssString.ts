/**
 * `text` as a quoted CSS string, safe to place in a stylesheet whatever it holds,
 * following CSSOM "serialize a string". Text read from a PDF can carry any
 * character: a raw newline ends a CSS string early and lets the rest parse as rules.
 */
export function cssString(text: string): string {
  let out = '"';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0) out += "�";
    else if (code <= 0x1f || code === 0x7f) out += `\\${code.toString(16)} `;
    else if (char === '"' || char === "\\") out += `\\${char}`;
    else out += char;
  }
  return `${out}"`;
}
