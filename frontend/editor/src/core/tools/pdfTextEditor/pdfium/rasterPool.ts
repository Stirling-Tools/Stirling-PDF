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
 * the pool pays for removing the backing-store allocation from every re-render.
 * The pool is keyed by module and dropped when a document closes, so it cannot
 * outlive the instance whose heap it points into.
 */
const MAX_SLOTS = 2;
const MAX_RETAINED_BYTES = 64 * 1024 * 1024;
// Small bitmaps are not worth the bookkeeping; freeing them keeps the pool
// from filling up with slots too small to serve the next page.
const MIN_POOLED_BYTES = 256 * 1024;

interface RasterSlot {
  ptr: number;
  /**
   * Bytes of the backing store, which is the capacity that was allocated, not
   * the bitmap currently using it: a 4096x4096 block handed to a 512x512 page
   * still occupies 64 MB until something else takes it.
   */
  bytes: number;
}

const pools = new WeakMap<object, RasterSlot[]>();
// Backing store of every bitmap this module has handed out. A bitmap's own
// stride does not describe the allocation under it, so the lease is what
// release hands back to the pool.
const leases = new WeakMap<object, Map<number, RasterSlot>>();

/** The module's wasm instance is what a slot's pointer is only valid within. */
function moduleKey(m: WrappedPdfiumModule): object {
  return m.pdfium;
}

function poolFor(m: WrappedPdfiumModule): RasterSlot[] {
  const key = moduleKey(m);
  let slots = pools.get(key);
  if (!slots) {
    slots = [];
    pools.set(key, slots);
  }
  return slots;
}

function leasesFor(m: WrappedPdfiumModule): Map<number, RasterSlot> {
  const key = moduleKey(m);
  let map = leases.get(key);
  if (!map) {
    map = new Map();
    leases.set(key, map);
  }
  return map;
}

/**
 * `FPDFBitmap_BGRA`, the format whose pixels are four bytes each in the order
 * the copy-out path reads them. It is not the alpha boolean that
 * `FPDFBitmap_Create` takes: `FPDFBitmap_CreateEx` wants the format identifier,
 * and passing 1 there selects `FPDFBitmap_Gray`, which writes a single byte per
 * pixel while the copy-out path reads four (verified against the shipped wasm:
 * after a white fill the last three quarters of a `width * 4` stride are still
 * untouched).
 */
export const RASTER_FORMAT_BGRA = 4;

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
    if (bitmapPtr) {
      leasesFor(m).set(bitmapPtr, slot);
      return bitmapPtr;
    }
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
  leasesFor(m).set(bitmapPtr, { ptr, bytes });
  return bitmapPtr;
}

/**
 * Destroys the bitmap and keeps its backing store for the next render, at the
 * capacity it was allocated with.
 *
 * `height` is consulted only for a bitmap this module did not hand out, where
 * the stride times the height is the best available estimate of the storage.
 */
export function releaseRaster(
  m: WrappedPdfiumModule,
  bitmapPtr: number,
  height: number,
): void {
  if (!bitmapPtr) return;
  const map = leasesFor(m);
  const lease = map.get(bitmapPtr);
  map.delete(bitmapPtr);
  const ptr = lease?.ptr ?? m.FPDFBitmap_GetBuffer(bitmapPtr);
  const bytes = lease?.bytes ?? m.FPDFBitmap_GetStride(bitmapPtr) * height;
  // FPDFBitmap_Destroy only frees the handle; for CreateEx the scan buffer is
  // the caller's, which is the whole point of handing it back to the pool.
  m.FPDFBitmap_Destroy(bitmapPtr);
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
  const slots = pools.get(moduleKey(m));
  if (!slots) return;
  for (const slot of slots) m.pdfium.wasmExports.free(slot.ptr);
  slots.length = 0;
}
