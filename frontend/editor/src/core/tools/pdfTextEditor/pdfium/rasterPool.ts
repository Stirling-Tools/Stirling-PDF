import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

/**
 * Reusable backing stores for the page bitmaps, bounded because linear memory
 * never shrinks: a retained block costs the process its bytes until it is reused.
 */
const MAX_SLOTS = 2;
const MAX_RETAINED_BYTES = 64 * 1024 * 1024;
// Small bitmaps are not worth the bookkeeping; freeing them keeps the pool
// from filling up with slots too small to serve the next page.
const MIN_POOLED_BYTES = 256 * 1024;

interface RasterSlot {
  ptr: number;
  /**
   * Allocated capacity, not the bitmap using it: a 4096x4096 block lent to a
   * 512x512 page still occupies 64 MB until something else takes it.
   */
  bytes: number;
}

const pools = new WeakMap<object, RasterSlot[]>();
// Backing store of every bitmap handed out: a bitmap's stride says nothing
// about the allocation under it, so this is what release returns to the pool.
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

/** `FPDFBitmap_BGRA`. Passing 1 selects `FPDFBitmap_Gray`, which writes one
 *  byte per pixel into the `width * 4` stride the copy-out reads as RGBA. */
export const RASTER_FORMAT_BGRA = 4;

/** A bitmap over pooled storage, or over fresh storage when nothing fits.
 *  `bitmapPtr` is 0 when the allocator refused the request. */
export function acquireRaster(
  m: WrappedPdfiumModule,
  width: number,
  height: number,
): number {
  const stride = width * 4;
  const bytes = stride * height;
  const slots = poolFor(m);
  // Slots are sorted largest-first and the smallest sufficient one is taken:
  // the largest would starve the next large render.
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
 * Destroys the bitmap and pools its storage at the capacity it was allocated
 * with. `height` is used only for a bitmap this module did not hand out.
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
