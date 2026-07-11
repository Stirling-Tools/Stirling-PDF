/**
 * Read a JPEG's EXIF orientation (1-8); 1 when absent or unreadable.
 *
 * The insert path decodes via <img>, which APPLIES EXIF orientation, but
 * the DCTDecode passthrough embeds the RAW bytes - so a phone photo with
 * orientation != 1 would insert sideways with a swapped aspect. Callers
 * use this to route rotated JPEGs to the bitmap path instead.
 */
export function jpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let off = 2;
  while (off + 4 <= bytes.length) {
    if (bytes[off] !== 0xff) return 1;
    const marker = bytes[off + 1];
    // SOS/EOI: image data begins - no EXIF ahead.
    if (marker === 0xda || marker === 0xd9) return 1;
    const size = (bytes[off + 2] << 8) | bytes[off + 3];
    if (size < 2) return 1;
    if (marker === 0xe1 && size >= 10) {
      const seg = off + 4;
      const isExif =
        bytes[seg] === 0x45 && // E
        bytes[seg + 1] === 0x78 && // x
        bytes[seg + 2] === 0x69 && // i
        bytes[seg + 3] === 0x66 && // f
        bytes[seg + 4] === 0 &&
        bytes[seg + 5] === 0;
      if (isExif) {
        const tiff = seg + 6;
        const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
        const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
        if (!little && !big) return 1;
        const u16 = (p: number): number =>
          little
            ? bytes[p] | (bytes[p + 1] << 8)
            : (bytes[p] << 8) | bytes[p + 1];
        const u32 = (p: number): number =>
          little
            ? (bytes[p] |
                (bytes[p + 1] << 8) |
                (bytes[p + 2] << 16) |
                (bytes[p + 3] << 24)) >>>
              0
            : ((bytes[p] << 24) |
                (bytes[p + 1] << 16) |
                (bytes[p + 2] << 8) |
                bytes[p + 3]) >>>
              0;
        if (tiff + 8 > bytes.length) return 1;
        const ifd = tiff + u32(tiff + 4);
        if (ifd + 2 > bytes.length) return 1;
        const count = u16(ifd);
        for (let i = 0; i < count; i++) {
          const e = ifd + 2 + i * 12;
          if (e + 12 > bytes.length) return 1;
          if (u16(e) === 0x0112) {
            const v = u16(e + 8);
            return v >= 1 && v <= 8 ? v : 1;
          }
        }
        return 1;
      }
    }
    off += 2 + size;
  }
  return 1;
}
