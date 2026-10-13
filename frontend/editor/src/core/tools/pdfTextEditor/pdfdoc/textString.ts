/**
 * Serialise `text` as a PDF text string (ISO 32000-1 7.9.2.2). Printable
 * ASCII stays a readable literal, since it means the same in PDFDocEncoding;
 * anything else is UTF-16BE behind a byte order mark, which every reader
 * decodes, where PDFDocEncoding cannot hold most scripts at all.
 */
export function encodeTextString(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) {
    return `(${text.replace(/[\\()]/g, (ch) => `\\${ch}`)})`;
  }
  let hex = "<FEFF";
  // JS strings are UTF-16 code units, so astral characters arrive as their
  // surrogate pair, which is exactly what UTF-16BE wants.
  for (let i = 0; i < text.length; i += 1) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  }
  return `${hex}>`;
}
