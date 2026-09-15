/**
 * Byte-level PDF probes for the viewer.
 *
 * Latin-1 decoding is byte-for-byte, so a byte scan answers "does this PDF
 * contain /X" without materialising a multi-megabyte string. Results for
 * /AcroForm are memoised per buffer because the form, signature and button
 * scanners all ask the same question about the same document.
 */
function containsAscii(bytes: Uint8Array, ascii: string): boolean {
  const first = ascii.charCodeAt(0);
  if (ascii.length === 1) return bytes.indexOf(first) !== -1;
  let from = 0;
  while (from <= bytes.length - ascii.length) {
    const idx = bytes.indexOf(first, from);
    if (idx === -1 || idx > bytes.length - ascii.length) return false;
    let match = true;
    for (let j = 1; j < ascii.length; j++) {
      if (bytes[idx + j] !== ascii.charCodeAt(j)) {
        match = false;
        break;
      }
    }
    if (match) return true;
    from = idx + 1;
  }
  return false;
}

const acroFormResults = new WeakMap<
  ArrayBuffer,
  { offset: number; length: number; result: boolean }
>();

/** True when the document may contain interactive form fields. */
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
  const result = containsAscii(bytes, "/AcroForm");
  acroFormResults.set(key, {
    offset: bytes.byteOffset,
    length: bytes.byteLength,
    result,
  });
  return result;
}
