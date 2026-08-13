/**
 * Load-time repairs, applied to the bytes before PDFium ever sees them.
 *
 * Each pass is optional and self-cancelling: it returns the original bytes
 * unless it is certain it improved them. A document this cannot understand
 * is opened exactly as it arrived, which is always a valid outcome.
 */
import { consolidateContents } from "@app/tools/pdfTextEditor/v2/pdfdoc/passes/consolidateContents";

/**
 * Above this the parse the passes need costs more than the repairs are worth,
 * and the failure they guard against is rare in files this large.
 */
const MAX_PREPARE_BYTES = 96 * 1024 * 1024;

export async function prepareForEditing(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  if (bytes.length > MAX_PREPARE_BYTES) return bytes;
  let out = bytes;

  // Scanned over the bytes, not a decoded string: this runs on every open,
  // and converting a multi-megabyte file to a string just to answer "is
  // there anything to do?" is pure latency on the load path.
  if (hasContentsArray(out)) {
    try {
      const merged = await consolidateContents(out);
      if (merged) out = merged.bytes;
    } catch {
      /* leaving the bytes alone is always safe */
    }
  }

  return out;
}

const CONTENTS = "/Contents";
const WHITESPACE = new Set([0x20, 0x09, 0x0d, 0x0a, 0x0c, 0x00]);
const OPEN_BRACKET = 0x5b;

/** True when some page's `/Contents` is an array rather than one stream. */
function hasContentsArray(bytes: Uint8Array): boolean {
  const first = CONTENTS.charCodeAt(0);
  const limit = bytes.length - CONTENTS.length;
  for (let i = 0; i < limit; i += 1) {
    if (bytes[i] !== first) continue;
    let k = 1;
    while (k < CONTENTS.length && bytes[i + k] === CONTENTS.charCodeAt(k)) {
      k += 1;
    }
    if (k < CONTENTS.length) continue;
    let j = i + CONTENTS.length;
    while (j < bytes.length && WHITESPACE.has(bytes[j])) j += 1;
    if (bytes[j] === OPEN_BRACKET) return true;
    i = j - 1;
  }
  return false;
}
