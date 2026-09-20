/**
 * One reusable wasm buffer per (module, purpose). PDFium calls take out-params
 * as pointers, and allocating a fresh 4-24 byte buffer for every call put
 * malloc/free traffic on the typing path. Slots are keyed by purpose, so a
 * function that calls another never aliases its buffer; buffers grow in place
 * when a call needs more room and are replaced (old pointer freed) only then.
 *
 * Keys are interned to array indices and the slot table is cached on the
 * module under a symbol, so a call is one property read plus one array index -
 * the typing path calls this a dozen times per keystroke. Modules that refuse
 * the property (frozen) fall back to a WeakMap.
 */
interface Slot {
  ptr: number;
  size: number;
}

export interface ScratchKey {
  readonly id: number;
  readonly name: string;
}

interface Arena {
  slots: Array<Slot | undefined>;
  exports: {
    malloc: (n: number) => number;
    free: (p: number) => void;
  };
}

const ARENA = Symbol("pdfiumScratchArena");
const fallbackArenas = new WeakMap<object, Arena>();
const keyIds: ScratchKey[] = [];

function key(name: string): ScratchKey {
  const k = { id: keyIds.length, name };
  keyIds.push(k);
  return k;
}

/** Every scratch buffer in the editor, one slot per purpose. */
export const SCRATCH = {
  readerCharRect: key("reader:char-rect"),
  readerCharX: key("reader:char-x"),
  readerCharY: key("reader:char-y"),
  readerBounds: key("reader:bounds"),
  readerFill: key("reader:fill"),
  readerMatrix: key("reader:matrix"),
  readerStroke: key("reader:stroke"),
  writerBbox: key("writer:bbox"),
  editBbox: key("edit:bbox"),
  reflowBbox: key("reflow:bbox"),
  reflowMatrix: key("reflow:matrix"),
  partialBbox: key("partial:bbox"),
  imageMatrix: key("image:matrix"),
  annotRect: key("annot:rect"),
  colourR: key("colour:r"),
  colourG: key("colour:g"),
  colourB: key("colour:b"),
  colourA: key("colour:a"),
  outlineR: key("outline:r"),
  outlineG: key("outline:g"),
  outlineB: key("outline:b"),
  outlineA: key("outline:a"),
  outlineW: key("outline:w"),
  faceL: key("face:l"),
  faceB: key("face:b"),
  faceR: key("face:r"),
  faceT: key("face:t"),
  faceLen: key("face:len"),
  faceOut: key("face:out"),
  fallbackL: key("fallback:l"),
  fallbackB: key("fallback:b"),
  fallbackR: key("fallback:r"),
  fallbackT: key("fallback:t"),
  cmapSize: key("cmap:size"),
  backendOut: key("backend:out"),
  displayRect: key("display:rect"),
  editOrigin: key("edit:origin"),
  editLoose: key("edit:loose"),
  editMatrix: key("edit:matrix"),
  editRunText: key("edit:run-text"),
  editObjText: key("edit:obj-text"),
  editBoxA: key("edit:box-a"),
  editBoxB: key("edit:box-b"),
  readerReadTextA: key("reader:read-text-a"),
  readerReadTextB: key("reader:read-text-b"),
  readerSize: key("reader:size"),
  reflowText: key("reflow:text"),
  charcodes: key("charcodes"),
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
  const host = m as unknown as Record<PropertyKey, unknown>;
  const cached = host[ARENA] as Arena | undefined;
  if (cached) return cached;
  let arena = fallbackArenas.get(m as object);
  if (!arena) {
    arena = { slots: [], exports: m.pdfium.wasmExports };
    fallbackArenas.set(m as object, arena);
    try {
      Object.defineProperty(host, ARENA, {
        value: arena,
        configurable: true,
      });
    } catch {
      /* frozen module: the WeakMap stays the only path */
    }
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
  const size = Math.max(4, bytes);
  const ptr = arena.exports.malloc(size);
  arena.slots[key.id] = { ptr, size };
  return ptr;
}

/** Test hook: how many live scratch slots this module currently owns. */
export function scratchSlotCount(m: ScratchHost): number {
  return arenaFor(m).slots.filter(Boolean).length;
}
