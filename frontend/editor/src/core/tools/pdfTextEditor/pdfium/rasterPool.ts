import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/**
 * Reusable backing stores for the page bitmaps.
 *
 * `FPDFBitmap_Create` allocates a `width * height * 4` block for every render,
 * and a scroll or a zoom re-renders the same pages at the same size over and
 * over. `FPDFBitmap_CreateEx` takes caller-supplied storage, so the block can
 * outlive one bitmap and be handed to the next render instead of going back to
 * the allocator.
 *
 * Retention is deliberately bounded. Linear memory never shrinks, so once a
 * render has grown it the growth is never returned to the OS: holding two
 * page-sized blocks sets the process high-water mark by those two blocks (a
 * page-sized pair measured +66 MB on an A4 document at DPR 2). That is the cost
 * the pool pays for removing an allocation and a page-fault sweep from every
 * re-render. The pool is keyed by module and dropped when a document closes, so
 * it cannot outlive the instance whose heap it points into.
 */
const MAX_SLOTS = 2;
const MAX_RETAINED_BYTES = 64 * 1024 * 1024;
// Small bitmaps are not worth the bookkeeping; freeing them keeps the pool
// from filling up with slots too small to serve the next page.
const MIN_POOLED_BYTES = 256 * 1024;

interface RasterSlot {
  ptr: number;
  bytes: number;
}

const pools = new WeakMap<object, RasterSlot[]>();

/** The module's wasm instance is what a slot's pointer is only valid within. */
function poolFor(m: WrappedPdfiumModule): RasterSlot[] {
  const key = m.pdfium as unknown as object;
  let slots = pools.get(key);
  if (!slots) {
    slots = [];
    pools.set(key, slots);
  }
  return slots;
}

export const RASTER_FORMAT_BGRA = 1;

/**
 * A bitmap whose scan buffer lives in the pool (or a freshly allocated one).
 * `bitmapPtr` is 0 when the allocator refused the request.
 */
export function acquireRaster(
  m: WrappedPdfiumModule,
  width: number,
  height: number,
): number {
  const stride = width * 4;
  const bytes = stride * height;
  const slots = poolFor(m);
  // Best fit: slots are sorted largest-first, so the smallest sufficient one
  // is the one that wastes the least. Taking the largest would hand a big
  // buffer to a small page and send the next large render to the allocator.
  let index = -1;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].bytes >= bytes) {
      index = i;
      break;
    }
  }
  if (index >= 0) {
    const slot = slots.splice(index, 1)[0];
    const bitmapPtr = m.FPDFBitmap_CreateEx(
      width,
      height,
      RASTER_FORMAT_BGRA,
      slot.ptr,
      stride,
    );
    if (bitmapPtr) return bitmapPtr;
    // CreateEx never took the storage, so it is still ours to free.
    m.pdfium.wasmExports.free(slot.ptr);
  }

  const ptr = m.pdfium.wasmExports.malloc(bytes);
  if (!ptr) return 0;
  const bitmapPtr = m.FPDFBitmap_CreateEx(
    width,
    height,
    RASTER_FORMAT_BGRA,
    ptr,
    stride,
  );
  if (!bitmapPtr) {
    m.pdfium.wasmExports.free(ptr);
    return 0;
  }
  return bitmapPtr;
}

/**
 * Destroys the bitmap and keeps its scan buffer for the next render.
 *
 * `height` must be the bitmap's own height: the retained byte count is what a
 * later best-fit checks a request against, so understating it would let a
 * buffer too small for a page be handed out.
 */
export function releaseRaster(
  m: WrappedPdfiumModule,
  bitmapPtr: number,
  height: number,
): void {
  if (!bitmapPtr) return;
  const ptr = m.FPDFBitmap_GetBuffer(bitmapPtr);
  const stride = m.FPDFBitmap_GetStride(bitmapPtr);
  // FPDFBitmap_Destroy only frees the handle; for CreateEx the scan buffer is
  // the caller's, which is the whole point of handing it back to the pool.
  m.FPDFBitmap_Destroy(bitmapPtr);
  const bytes = stride * height;
  if (ptr && bytes >= MIN_POOLED_BYTES) {
    const slots = poolFor(m);
    slots.push({ ptr, bytes });
    slots.sort((a, b) => b.bytes - a.bytes);
    let retained = 0;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (i < MAX_SLOTS && retained + slot.bytes <= MAX_RETAINED_BYTES) {
        retained += slot.bytes;
      } else {
        m.pdfium.wasmExports.free(slot.ptr);
        slots.splice(i, 1);
        i--;
      }
    }
    return;
  }
  if (ptr) m.pdfium.wasmExports.free(ptr);
}

/** Frees every retained slot. Called when the document that owns them closes. */
export function releaseRasterPool(m: WrappedPdfiumModule): void {
  const slots = pools.get(m.pdfium);
  if (!slots) return;
  for (const slot of slots) m.pdfium.wasmExports.free(slot.ptr);
  slots.length = 0;
}
