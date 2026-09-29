/**
 * Byte <-> latin1-string helpers for the raw-PDF layer.
 *
 * The surgery passes all want the file as a string so they can use the
 * regex engine on it, but a 12 MB book costs real time to convert - and
 * several passes run back to back over the same buffer. Memoise on the
 * buffer identity so it converts once per document, not once per pass.
 */

const cache = new WeakMap<Uint8Array, string>();

/** Chunked so `String.fromCharCode.apply` never blows the argument limit. */
export function toLatin1(bytes: Uint8Array): string {
  const hit = cache.get(bytes);
  if (hit !== undefined) return hit;
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(
      null,
      bytes.subarray(
        i,
        Math.min(i + CHUNK, bytes.length),
      ) as unknown as number[],
    );
  }
  cache.set(bytes, out);
  return out;
}

export function fromLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Undo a PNG predictor (`/DecodeParms << /Predictor 12 ... >>`).
 *
 * Cross-reference streams almost always use predictor 12, so this is on the
 * critical path for reading any PDF 1.5+ file.
 */
export function undoPngPredictor(
  data: Uint8Array,
  colors: number,
  bpc: number,
  columns: number,
): Uint8Array {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r += 1) {
    const tag = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i += 1) {
      const raw = src[i] ?? 0;
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      switch (tag) {
        case 0:
          cur[i] = raw;
          break;
        case 1:
          cur[i] = (raw + left) & 0xff;
          break;
        case 2:
          cur[i] = (raw + up) & 0xff;
          break;
        case 3:
          cur[i] = (raw + ((left + up) >> 1)) & 0xff;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          cur[i] = (raw + pred) & 0xff;
          break;
        }
        default:
          cur[i] = raw;
          break;
      }
    }
    out.set(cur, r * rowLen);
    prev = cur;
  }
  return out;
}

async function throughStream(
  data: Uint8Array,
  format: CompressionFormat,
  kind: "inflate" | "deflate",
): Promise<Uint8Array> {
  const src = new Blob([data as BlobPart]).stream();
  const piped =
    kind === "inflate"
      ? src.pipeThrough(new DecompressionStream(format))
      : src.pipeThrough(new CompressionStream(format));
  const buf = await new Response(piped).arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Inflate a `/FlateDecode` stream. PDF's Flate is zlib-wrapped, but real
 * files in the wild ship raw deflate often enough that the fallback earns
 * its keep - a single malformed stream must not fail a whole document.
 */
export async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await throughStream(data, "deflate", "inflate");
  } catch {
    try {
      return await throughStream(data, "deflate-raw", "inflate");
    } catch {
      return null;
    }
  }
}

export async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await throughStream(data, "deflate", "deflate");
  } catch {
    return null;
  }
}
