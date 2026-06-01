/**
 * Strategy for resolving Unicode chars to font-specific charcodes when
 * writing new text into an existing embedded subset font.
 *
 * PDFium's `FPDFText_SetText` does a reverse Unicode→CID lookup that
 * fails for most letters/symbols in subset fonts (only digits and a
 * few common chars round-trip cleanly). The strategies below each
 * derive Unicode→charcode mappings differently, then call
 * `FPDFText_SetCharcodes` to write the new text using the SAME
 * charcodes the original PDF used - so the new chars hit the same
 * glyphs the embedded subset already contains.
 *
 * Toggleable at runtime via:
 *   1. URL param `?charcodeStrategy=cmap` (per-window override)
 *   2. localStorage `v2.charcodeStrategy` (persisted across reloads)
 *   3. Toolbar dropdown
 *
 * Default is `helvetica` (preserves the legacy fallback behaviour).
 */
export type CharcodeStrategy =
  | "helvetica" // Legacy: always fall back to Helvetica for new chars.
  | "cmap" // Parse the embedded font's cmap table.
  | "content-stream" // Read raw PDF content streams to extract charcode bytes.
  | "backend"; // Send to Spring backend, PDFBox encodes server-side.

export const CHARCODE_STRATEGIES: readonly CharcodeStrategy[] = [
  "helvetica",
  "cmap",
  "content-stream",
  "backend",
] as const;

const STORAGE_KEY = "v2.charcodeStrategy";
const URL_PARAM = "charcodeStrategy";

/**
 * Resolve the active strategy: URL param wins over localStorage, which
 * wins over the default. Reads are done lazily on each call so the
 * user can flip a toggle and have it take effect on the next edit
 * without remounting the editor.
 */
export function getActiveCharcodeStrategy(): CharcodeStrategy {
  if (typeof window === "undefined") return "helvetica";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(URL_PARAM);
    if (fromUrl && isStrategy(fromUrl)) return fromUrl;
  } catch {
    /* ignore malformed URL */
  }
  try {
    const fromLs = window.localStorage.getItem(STORAGE_KEY);
    if (fromLs && isStrategy(fromLs)) return fromLs;
  } catch {
    /* localStorage may be disabled */
  }
  return "helvetica";
}

export function setActiveCharcodeStrategy(s: CharcodeStrategy): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, s);
  } catch {
    /* best-effort */
  }
}

function isStrategy(value: string): value is CharcodeStrategy {
  return (CHARCODE_STRATEGIES as readonly string[]).includes(value);
}

/**
 * Per-strategy result for a Unicode→charcodes resolve attempt.
 *
 * `charcodes`: the array of font-specific bytes/CIDs to pass to
 * FPDFText_SetCharcodes. Each entry corresponds 1:1 with a char in
 * the requested text (some chars may use multi-byte sequences but
 * PDFium's SetCharcodes takes the raw int per char).
 *
 * `coverage`: how many of the requested chars were resolved. If
 * coverage < text.length the caller MUST fall back (e.g. to
 * Helvetica) because writing partial charcodes would produce wrong
 * text.
 *
 * `missing`: chars that couldn't be resolved (for diagnostics).
 *
 * `note`: human-readable strategy-specific status (logged for
 * comparison between strategies).
 */
export interface CharcodeResolveResult {
  charcodes: number[];
  coverage: number;
  missing: string[];
  note: string;
}

/**
 * Contract every strategy implementation satisfies. `null` from
 * resolve() means the strategy can't run AT ALL for this font (e.g.
 * font data not available, backend offline) - caller falls back.
 * A non-null result with coverage < text.length means the strategy
 * is engaged but missed some chars - caller can still fall back to
 * Helvetica for the whole insert OR mix per-char (caller's choice).
 */
export interface CharcodeResolver {
  readonly name: CharcodeStrategy;
  /**
   * Resolve every char in `text` to a charcode usable with
   * FPDFText_SetCharcodes against the given font pointer. Returns
   * null when the strategy is fundamentally unavailable for this
   * font (e.g. cmap parser couldn't find a TrueType cmap table).
   */
  resolve(
    font: number,
    text: string,
    ctx: ResolverContext,
  ): CharcodeResolveResult | null;
}

/**
 * Hooks every strategy needs: PDFium module access, the source
 * page handle (for content-stream parsing), and fetch() for backend.
 */
export interface ResolverContext {
  module: import("@embedpdf/pdfium").WrappedPdfiumModule;
  pagePtr: number;
  docPtr: number;
}
