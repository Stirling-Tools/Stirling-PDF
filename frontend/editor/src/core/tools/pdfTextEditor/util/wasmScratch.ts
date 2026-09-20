/**
 * One reusable wasm buffer per (module, purpose). PDFium calls take out-params
 * as pointers, and a fresh 4-24 byte allocation per call put malloc/free
 * traffic on the typing path. Slots are keyed by purpose, so a function that
 * calls another never aliases its buffer.
 *
 * A slot keeps its high-water mark for as long as the module lives, so a
 * variable-sized slot (text reads, charcodes) can pin the largest request made
 * against it. `releaseScratch` drops every slot and `EditorDocument.dispose`
 * calls it, so that retention ends with the document.
 */
interface Slot {
  ptr: number;
  size: number;
}

/** Interned slot identity: two calls share a buffer only when keys are equal. */
export interface ScratchKey {
  readonly id: number;
}

interface Arena {
  slots: Array<Slot | undefined>;
  exports: {
    malloc: (n: number) => number;
    free: (p: number) => void;
  };
}

const arenas = new WeakMap<object, Arena>();
let nextKeyId = 0;

function key(): ScratchKey {
  return { id: nextKeyId++ };
}

/** Every scratch buffer in the editor, one slot per purpose. */
export const SCRATCH = {
  readerCharRect: key(),
  readerCharX: key(),
  readerCharY: key(),
  readerBounds: key(),
  readerFill: key(),
  readerMatrix: key(),
  readerStroke: key(),
  writerBbox: key(),
  editBbox: key(),
  reflowBbox: key(),
  reflowMatrix: key(),
  partialBbox: key(),
  imageMatrix: key(),
  annotRect: key(),
  colourR: key(),
  colourG: key(),
  colourB: key(),
  colourA: key(),
  outlineR: key(),
  outlineG: key(),
  outlineB: key(),
  outlineA: key(),
  outlineW: key(),
  faceL: key(),
  faceB: key(),
  faceR: key(),
  faceT: key(),
  faceLen: key(),
  faceOut: key(),
  fallbackL: key(),
  fallbackB: key(),
  fallbackR: key(),
  fallbackT: key(),
  cmapSize: key(),
  backendOut: key(),
  displayRect: key(),
  editOrigin: key(),
  editLoose: key(),
  editMatrix: key(),
  editRunText: key(),
  editObjText: key(),
  editSetText: key(),
  editBoxA: key(),
  editBoxB: key(),
  readerReadTextA: key(),
  readerReadTextB: key(),
  readerSize: key(),
  reflowText: key(),
  charcodes: key(),
} as const;

/** Structural minimum: any wrapper that exposes PDFium's wasm allocator. */
export interface ScratchHost {
  pdfium: {
    wasmExports: {
      malloc: (n: number) => number;
      free: (p: number) => void;
    };
  };
}

function arenaFor(m: ScratchHost): Arena {
  let arena = arenas.get(m);
  if (!arena) {
    arena = { slots: [], exports: m.pdfium.wasmExports };
    arenas.set(m, arena);
  }
  return arena;
}

export function scratchPtr(
  m: ScratchHost,
  key: ScratchKey,
  bytes: number,
): number {
  const arena = arenaFor(m);
  const slot = arena.slots[key.id];
  if (slot && slot.size >= bytes) return slot.ptr;
  if (slot) arena.exports.free(slot.ptr);
  // Double rather than fit exactly: text buffers grow a character at a time,
  // and refitting would put a malloc/free pair back on every keystroke.
  const size = Math.max(4, bytes, slot ? slot.size * 2 : 0);
  const ptr = arena.exports.malloc(size);
  arena.slots[key.id] = { ptr, size };
  return ptr;
}

/**
 * Free every slot. Buffers never outlive a synchronous call, so any point
 * between calls is safe; `EditorDocument.dispose` is where the retention ends.
 */
export function releaseScratch(m: ScratchHost): void {
  const arena = arenas.get(m);
  if (!arena) return;
  for (const slot of arena.slots) {
    if (slot) arena.exports.free(slot.ptr);
  }
  arena.slots = [];
}
