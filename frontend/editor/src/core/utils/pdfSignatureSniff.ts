const MARKER = "/ByteRange";
const CHUNK_SIZE = 1024 * 1024;

/**
 * True when the PDF holds a digital signature. Signature dictionaries are never in object streams
 * (their /Contents is patched in place), so this raw scan works even while the file is encrypted.
 */
export async function hasDigitalSignature(file: Blob): Promise<boolean> {
  const decoder = new TextDecoder("latin1");
  let carry = "";
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const bytes = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    const text = carry + decoder.decode(bytes);
    if (text.includes(MARKER)) return true;
    // Keep a tail so a marker split across two chunks is still found.
    carry = text.slice(-(MARKER.length - 1));
  }
  return false;
}
