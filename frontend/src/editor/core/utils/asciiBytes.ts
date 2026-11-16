/**
 * Byte-level PDF probes for the viewer.
 *
 * Latin-1 decoding is byte-for-byte, so a byte scan answers "does this PDF
 * contain /X" without materialising a multi-megabyte string. Results for
 * /AcroForm are memoised per buffer because the form, signature and button
 * scanners all ask the same question about the same document.
 */
// ISO 32000-1, 7.2.3: whitespace and the delimiters that end a name token.
const NAME_DELIMITER = new Set([
  0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, 0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b,
  0x7d, 0x2f, 0x25,
]);

/**
 * True when `name` appears as a whole PDF name token. Matching the raw bytes
 * alone would treat `/AcroFormExtra` or a name inside a content stream as a hit
 * and send a form-less file down the expensive path.
 */
function containsPdfName(bytes: Uint8Array, name: string): boolean {
  const first = name.charCodeAt(0);
  let from = 0;
  while (from <= bytes.length - name.length) {
    const idx = bytes.indexOf(first, from);
    if (idx === -1 || idx > bytes.length - name.length) return false;
    let match = true;
    for (let j = 1; j < name.length; j++) {
      if (bytes[idx + j] !== name.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    const after = idx + name.length;
    if (match && (after === bytes.length || NAME_DELIMITER.has(bytes[after]))) {
      return true;
    }
    from = idx + 1;
  }
  return false;
}

const acroFormResults = new WeakMap<
  ArrayBuffer,
  { offset: number; length: number; result: boolean }
>();

/**
 * True when the bytes contain a literal /AcroForm name. This is a hint only:
 * the name can live inside a compressed object stream, and it can appear in a
 * stream or comment. `documentHasFormFields` confirms the catalog.
 */
export function hasAcroForm(bytes: Uint8Array): boolean {
  const key = bytes.buffer as ArrayBuffer;
  const cached = acroFormResults.get(key);
  if (
    cached &&
    cached.offset === bytes.byteOffset &&
    cached.length === bytes.byteLength
  ) {
    return cached.result;
  }
  const result = containsPdfName(bytes, "/AcroForm");
  acroFormResults.set(key, {
    offset: bytes.byteOffset,
    length: bytes.byteLength,
    result,
  });
  return result;
}
