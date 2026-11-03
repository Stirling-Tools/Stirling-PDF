/** `convertToBlob` silently serialises to PNG for a format it can't encode
 *  (WebKit, WebP), so only the returned `type` reveals it. Probe once per realm. */

/** Candidates in preference order, best compression first. PNG always works. */
const LOSSY_CANDIDATES = ["image/webp", "image/jpeg"] as const;
const PNG_TYPE = "image/png";

let probe: Promise<string> | null = null;

async function honoursType(type: string, quality: number): Promise<boolean> {
  try {
    const canvas = new OffscreenCanvas(2, 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    // JPEG has no alpha, and the pixels are thrown away either way.
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 2, 2);
    const blob = await canvas.convertToBlob({ type, quality });
    return blob.type === type;
  } catch {
    return false;
  }
}

async function detectLossyType(quality: number): Promise<string> {
  if (typeof OffscreenCanvas === "undefined") return PNG_TYPE;
  for (const candidate of LOSSY_CANDIDATES) {
    if (await honoursType(candidate, quality)) return candidate;
  }
  return PNG_TYPE;
}

/** Encode options for a page raster: the best lossy format this engine really
 *  supports, PNG only if it supports none. `quality` is ignored by PNG. */
export function lossyEncodeOptions(
  quality = 0.85,
): Promise<ImageEncodeOptions> {
  probe ??= detectLossyType(quality);
  return probe.then((type) => ({ type, quality }));
}

/** Reset the cached probe. Tests only. */
export function resetCanvasEncodingProbe(): void {
  probe = null;
}
