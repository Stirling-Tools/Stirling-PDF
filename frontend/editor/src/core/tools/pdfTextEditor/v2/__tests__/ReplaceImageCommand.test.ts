import { describe, it, expect } from "vitest";
import { ReplaceImageCommand } from "@app/tools/pdfTextEditor/v2/commands/ReplaceImageCommand";
import { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { Affine, PageRect } from "@app/tools/pdfTextEditor/v2/types";

const OLD_PTR = 42;
/** 90-degree rotated placement: a naive (w,0,0,h,x,y) rebuild would flip it. */
const ROTATED: Affine = { a: 0, b: 120, c: -80, d: 0, e: 300, f: 40 };
const BOX: PageRect = { x: 220, y: 40, width: 80, height: 120 };

interface FakeModule {
  objs: number[];
  destroyed: number[];
  /** [objPtr, a, b, c, d, e, f] per FPDFImageObj_SetMatrix call. */
  matrixCalls: number[][];
  /** Same shape, but recorded from the FS_MATRIX struct fallback. */
  structMatrixCalls: number[][];
  newImageObjs: number;
  bitmapsCreated: number;
  jpegLoads: number;
  generateCalls: number;
  module: EditorDocument["module"];
}

/** Stub PDFium: page objects are a pointer array (index 0 = bottom). */
function fakePdfium(
  objs: number[],
  opts: {
    imageMatrixSetter?: boolean;
    insertAtIndex?: boolean;
    jpeg?: boolean;
  } = {},
): FakeModule {
  const heap = new ArrayBuffer(64 * 1024);
  const view = new DataView(heap);
  const state: FakeModule = {
    objs,
    destroyed: [],
    matrixCalls: [],
    structMatrixCalls: [],
    newImageObjs: 0,
    bitmapsCreated: 0,
    jpegLoads: 0,
    generateCalls: 0,
    module: null as unknown as EditorDocument["module"],
  };
  let nextPtr = 1000;
  let brk = 64;
  let bitmapWidth = 0;

  const module: Record<string, unknown> = {
    FPDFPage_CountObjects: () => objs.length,
    FPDFPage_GetObject: (_p: number, i: number) => objs[i] ?? 0,
    FPDFPage_RemoveObject: (_p: number, ptr: number) => {
      const i = objs.indexOf(ptr);
      if (i < 0) return false;
      objs.splice(i, 1);
      return true;
    },
    FPDFPage_InsertObject: (_p: number, ptr: number) => {
      objs.push(ptr);
    },
    FPDFPageObj_Destroy: (ptr: number) => {
      state.destroyed.push(ptr);
    },
    FPDFPageObj_NewImageObj: () => {
      state.newImageObjs += 1;
      nextPtr += 1;
      return nextPtr;
    },
    FPDFBitmap_Create: (w: number) => {
      state.bitmapsCreated += 1;
      bitmapWidth = w;
      return 500;
    },
    FPDFBitmap_GetBuffer: () => 4096,
    FPDFBitmap_GetStride: () => bitmapWidth * 4,
    FPDFBitmap_Destroy: () => undefined,
    FPDFImageObj_SetBitmap: () => true,
    FPDFPageObj_SetMatrix: (obj: number, ptr: number) => {
      const vals: number[] = [obj];
      for (let i = 0; i < 6; i++) vals.push(view.getFloat32(ptr + i * 4, true));
      state.structMatrixCalls.push(vals);
      return true;
    },
    FPDFPage_GenerateContent: () => {
      state.generateCalls += 1;
    },
    pdfium: {
      setValue: (ptr: number, value: number, type: string) => {
        if (type === "float") view.setFloat32(ptr, value, true);
        else view.setInt32(ptr, value, true);
      },
      wasmExports: {
        malloc: (size: number) => {
          const p = brk;
          brk += size;
          return p;
        },
        free: () => undefined,
        memory: { buffer: heap },
      },
      HEAPU8: new Uint8Array(heap),
      addFunction: () => 7,
      removeFunction: () => undefined,
    },
  };
  if (opts.imageMatrixSetter !== false) {
    module.FPDFImageObj_SetMatrix = (
      obj: number,
      a: number,
      b: number,
      c: number,
      d: number,
      e: number,
      f: number,
    ) => {
      state.matrixCalls.push([obj, a, b, c, d, e, f]);
      return true;
    };
  }
  if (opts.insertAtIndex !== false) {
    module.FPDFPage_InsertObjectAtIndex = (
      _p: number,
      ptr: number,
      index: number,
    ) => {
      objs.splice(index, 0, ptr);
      return true;
    };
  }
  if (opts.jpeg) {
    module.FPDFImageObj_LoadJpegFileInline = () => {
      state.jpegLoads += 1;
      return true;
    };
  }
  state.module = module as unknown as EditorDocument["module"];
  return state;
}

function pageWithImage(): Page {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  page.setImages([
    new ImageObject({
      id: "img1",
      pageIndex: 0,
      pdfiumObjPtr: OLD_PTR,
      bounds: { ...BOX },
      matrix: { ...ROTATED },
    }),
  ]);
  return page;
}

function fakeDoc(fake: FakeModule, page: Page): EditorDocument {
  return {
    module: fake.module,
    docPtr: 9,
    page: () => page,
  } as unknown as EditorDocument;
}

/** Replacement pixels with a deliberately different aspect ratio (4x1). */
const REPLACEMENT = {
  rgba: new Uint8Array(4 * 1 * 4).fill(200),
  width: 4,
  height: 1,
};

function makeCommand(jpegBytes?: Uint8Array): ReplaceImageCommand {
  return new ReplaceImageCommand({
    pageIndex: 0,
    imageId: "img1",
    image: REPLACEMENT,
    jpegBytes,
  });
}

describe("ReplaceImageCommand", () => {
  it("keeps the existing placement matrix exactly, whatever the new pixel ratio", () => {
    const page = pageWithImage();
    const fake = fakePdfium([OLD_PTR]);
    makeCommand().apply(fakeDoc(fake, page));

    const img = page.images[0];
    expect(img.pdfiumObjPtr).not.toBe(OLD_PTR);
    // The written matrix is the captured one, NOT a rebuilt (w,0,0,h,x,y).
    expect(fake.matrixCalls).toEqual([
      [img.pdfiumObjPtr, 0, 120, -80, 0, 300, 40],
    ]);
    expect(img.matrix).toEqual(ROTATED);
    expect(img.bounds).toEqual(BOX);
  });

  it("puts the replacement back in the old object's z-order slot", () => {
    const page = pageWithImage();
    const fake = fakePdfium([7, OLD_PTR, 9]);
    makeCommand().apply(fakeDoc(fake, page));

    expect(fake.objs).toEqual([7, page.images[0].pdfiumObjPtr, 9]);
  });

  it("detaches the old object WITHOUT destroying it, so undo is not a use-after-free", () => {
    const page = pageWithImage();
    const fake = fakePdfium([OLD_PTR]);
    makeCommand().apply(fakeDoc(fake, page));

    expect(fake.objs).not.toContain(OLD_PTR);
    expect(fake.destroyed).toEqual([]);
  });

  it("marks the page dirty and needing regeneration instead of generating content", () => {
    const page = pageWithImage();
    const fake = fakePdfium([OLD_PTR]);
    const rev0 = page.revision;
    makeCommand().apply(fakeDoc(fake, page));

    expect(page.revision).toBeGreaterThan(rev0);
    expect(page.needsGenerateContent).toBe(true);
    expect(page.images[0].dirty).toBe(true);
    expect(fake.generateCalls).toBe(0);
  });

  it("revert restores the original object, matrix and bounds", () => {
    const page = pageWithImage();
    const fake = fakePdfium([7, OLD_PTR, 9]);
    const doc = fakeDoc(fake, page);
    const cmd = makeCommand();
    cmd.apply(doc);
    const replacement = page.images[0].pdfiumObjPtr;

    cmd.revert(doc);

    expect(fake.objs).toEqual([7, OLD_PTR, 9]);
    expect(page.images[0].pdfiumObjPtr).toBe(OLD_PTR);
    expect(page.images[0].matrix).toEqual(ROTATED);
    expect(page.images[0].bounds).toEqual(BOX);
    // The replacement survives for redo, so it must not have been destroyed.
    expect(fake.destroyed).not.toContain(replacement);
    expect(page.needsGenerateContent).toBe(true);
  });

  it("redo re-attaches the same replacement instead of embedding twice", () => {
    const page = pageWithImage();
    const fake = fakePdfium([7, OLD_PTR, 9]);
    const doc = fakeDoc(fake, page);
    const cmd = makeCommand();
    cmd.apply(doc);
    const replacement = page.images[0].pdfiumObjPtr;
    cmd.revert(doc);
    cmd.apply(doc);

    expect(fake.newImageObjs).toBe(1);
    expect(fake.objs).toEqual([7, replacement, 9]);
    expect(page.images[0].pdfiumObjPtr).toBe(replacement);
    expect(page.images[0].matrix).toEqual(ROTATED);
  });

  it("falls back to the FS_MATRIX setter when FPDFImageObj_SetMatrix is missing", () => {
    const page = pageWithImage();
    const fake = fakePdfium([OLD_PTR], { imageMatrixSetter: false });
    makeCommand().apply(fakeDoc(fake, page));

    const written = fake.structMatrixCalls.at(-1);
    expect(written?.slice(1)).toEqual([0, 120, -80, 0, 300, 40]);
    expect(page.images[0].matrix).toEqual(ROTATED);
  });

  it("embeds supplied JPEG bytes as-is rather than re-encoding the bitmap", () => {
    const page = pageWithImage();
    const fake = fakePdfium([OLD_PTR], { jpeg: true });
    makeCommand(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).apply(
      fakeDoc(fake, page),
    );

    expect(fake.jpegLoads).toBe(1);
    expect(fake.bitmapsCreated).toBe(0);
    expect(fake.matrixCalls.at(-1)?.slice(1)).toEqual([
      0, 120, -80, 0, 300, 40,
    ]);
  });

  it("is a no-op for an unknown image id", () => {
    const page = pageWithImage();
    const fake = fakePdfium([OLD_PTR]);
    const cmd = new ReplaceImageCommand({
      pageIndex: 0,
      imageId: "missing",
      image: REPLACEMENT,
    });
    cmd.apply(fakeDoc(fake, page));
    cmd.revert(fakeDoc(fake, page));

    expect(fake.objs).toEqual([OLD_PTR]);
    expect(fake.newImageObjs).toBe(0);
    expect(page.revision).toBe(0);
  });

  it("leaves the page untouched when the embed fails", () => {
    const page = pageWithImage();
    const fake = fakePdfium([OLD_PTR]);
    (
      fake.module as unknown as Record<string, unknown>
    ).FPDFPageObj_NewImageObj = () => 0;
    makeCommand().apply(fakeDoc(fake, page));

    expect(fake.objs).toEqual([OLD_PTR]);
    expect(page.images[0].pdfiumObjPtr).toBe(OLD_PTR);
    expect(page.needsGenerateContent).toBe(false);
  });
});
