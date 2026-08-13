import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

// The overlay used to collapse every document font to one of three generic CSS
// stacks, so editing text visibly changed its shape. PDFium will hand back the
// face it actually rendered with - embedded, or the one it substituted - and a
// FontFace built from those bytes matches the bitmap underneath exactly.

const faces = new Map<number, FontFace>();
/** Pointers already tried, so a font that cannot load is not retried per run. */
const attempted = new Set<number>();

/** CSS family name for a font pointer. Stable whether or not it ever loads. */
export function embeddedFaceFamily(fontPtr: number): string {
  return `pdfface-${fontPtr}`;
}

/**
 * Register the face PDFium rendered with, under {@link embeddedFaceFamily}.
 * Fire-and-forget: an unsupported format just never resolves and the overlay's
 * generic stack keeps applying.
 */
export function registerEmbeddedFace(
  m: WrappedPdfiumModule,
  fontPtr: number,
): void {
  if (!fontPtr || attempted.has(fontPtr)) return;
  attempted.add(fontPtr);
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return;
  }
  const bytes = readFontData(m, fontPtr);
  // Bare CFF and Type1 are common in PDFs and FontFace accepts neither, so a
  // rejected load is an ordinary outcome rather than an error.
  if (!bytes || bytes.length === 0) return;
  if (faceBytesHeld + bytes.length > MAX_TOTAL_FACE_BYTES) return;
  faceBytesHeld += bytes.length;
  try {
    const face = new FontFace(embeddedFaceFamily(fontPtr), bytes);
    faces.set(fontPtr, face);
    void face
      .load()
      .then(() => document.fonts.add(face))
      .catch(() => faces.delete(fontPtr));
  } catch {
    /* constructor rejects a malformed buffer outright */
  }
}

/** Copy a font's face bytes out of the WASM heap. */
function readFontData(
  m: WrappedPdfiumModule,
  fontPtr: number,
): Uint8Array<ArrayBuffer> | null {
  const w = m.pdfium.wasmExports;
  const lenPtr = w.malloc(4);
  let size = 0;
  try {
    if (!m.FPDFFont_GetFontData(fontPtr, 0, 0, lenPtr)) return null;
    size = m.pdfium.getValue(lenPtr, "i32");
  } catch {
    return null;
  } finally {
    w.free(lenPtr);
  }
  if (size <= 0 || size > MAX_FACE_BYTES) return null;

  const buf = w.malloc(size);
  const out = w.malloc(4);
  try {
    if (!m.FPDFFont_GetFontData(fontPtr, buf, size, out)) return null;
    const heap = new Uint8Array(
      (m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory }).memory
        .buffer,
      buf,
      size,
    );
    // Copy into a plain ArrayBuffer: the heap view dies with the next
    // allocation that grows memory, and FontFace rejects a shared buffer.
    const copy = new Uint8Array(new ArrayBuffer(size));
    copy.set(heap);
    return copy;
  } catch {
    return null;
  } finally {
    w.free(buf);
    w.free(out);
  }
}

/** A face larger than this is a corrupt length, not a font. */
const MAX_FACE_BYTES = 8 * 1024 * 1024;
/** Total face bytes to hold for one document, so a font-heavy file can't balloon. */
const MAX_TOTAL_FACE_BYTES = 48 * 1024 * 1024;
let faceBytesHeld = 0;

/** Doc-scoped reset: PDFium reuses font pointers across documents. */
export function resetEmbeddedFaces(): void {
  if (typeof document !== "undefined") {
    for (const face of faces.values()) {
      try {
        document.fonts.delete(face);
      } catch {
        /* never added */
      }
    }
  }
  faces.clear();
  attempted.clear();
  faceBytesHeld = 0;
}
