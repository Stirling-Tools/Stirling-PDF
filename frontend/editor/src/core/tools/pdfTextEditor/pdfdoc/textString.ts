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

/**
 * Read a PDF string token, `(literal)` or `<hex>`, as a text string (ISO
 * 32000-1 7.9.2.2): UTF-16BE or UTF-8 behind a byte order mark, else
 * PDFDocEncoding. Null when the token is not a string.
 */
export function decodeTextString(token: string): string | null {
  const bytes = token.startsWith("(")
    ? literalBytes(token)
    : token.startsWith("<") && !token.startsWith("<<")
      ? hexBytes(token)
      : null;
  if (!bytes) return null;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      text += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return text;
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(Uint8Array.from(bytes.slice(3)));
  }
  return String.fromCharCode(...bytes.map(fromPdfDocEncoding));
}

const LITERAL_ESCAPES: Record<string, number> = {
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  b: 0x08,
  f: 0x0c,
  "(": 0x28,
  ")": 0x29,
  "\\": 0x5c,
};

/** The bytes of a literal string token (ISO 32000-1 7.3.4.2), or null when it is unterminated. */
function literalBytes(token: string): number[] | null {
  const out: number[] = [];
  let depth = 0;
  for (let i = 1; i < token.length; i += 1) {
    const c = token[i];
    if (c === "\\") {
      i += 1;
      const next = token[i];
      if (next === undefined) return null;
      if (next in LITERAL_ESCAPES) {
        out.push(LITERAL_ESCAPES[next]);
      } else if (next >= "0" && next <= "7") {
        let digits = next;
        while (digits.length < 3 && /[0-7]/.test(token[i + 1] ?? "")) {
          i += 1;
          digits += token[i];
        }
        out.push(parseInt(digits, 8) & 0xff);
      } else if (next === "\r") {
        // A backslash before an end-of-line continues the string on the next line.
        if (token[i + 1] === "\n") i += 1;
      } else if (next !== "\n") {
        // An unknown escape keeps the character and drops the backslash.
        out.push(next.charCodeAt(0) & 0xff);
      }
      continue;
    }
    if (c === "(") depth += 1;
    if (c === ")") {
      if (depth === 0) return out;
      depth -= 1;
    }
    if (c === "\r") {
      // Every end-of-line in a literal reads as a single LF.
      out.push(0x0a);
      if (token[i + 1] === "\n") i += 1;
      continue;
    }
    out.push(c.charCodeAt(0) & 0xff);
  }
  return null;
}

function hexBytes(token: string): number[] | null {
  const end = token.indexOf(">");
  if (end < 0) return null;
  let hex = token.slice(1, end).replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]*$/.test(hex)) return null;
  // A missing final digit is taken as 0.
  if (hex.length % 2 === 1) hex += "0";
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

// PDFDocEncoding (ISO 32000-1 Annex D.2) where it differs from Latin-1.
const PDF_DOC_LOW = [
  0x02d8, 0x02c7, 0x02c6, 0x02d9, 0x02dd, 0x02db, 0x02da, 0x02dc,
];
const PDF_DOC_HIGH = [
  0x2022, 0x2020, 0x2021, 0x2026, 0x2014, 0x2013, 0x0192, 0x2044, 0x2039,
  0x203a, 0x2212, 0x2030, 0x201e, 0x201c, 0x201d, 0x2018, 0x2019, 0x201a,
  0x2122, 0xfb01, 0xfb02, 0x0141, 0x0152, 0x0160, 0x0178, 0x017d, 0x0131,
  0x0142, 0x0153, 0x0161, 0x017e,
];

function fromPdfDocEncoding(byte: number): number {
  if (byte >= 0x18 && byte <= 0x1f) return PDF_DOC_LOW[byte - 0x18];
  if (byte >= 0x80 && byte <= 0x9e) return PDF_DOC_HIGH[byte - 0x80];
  if (byte === 0xa0) return 0x20ac;
  return byte;
}
