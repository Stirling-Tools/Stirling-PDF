import { describe, it, expect } from "vitest";
import { ChangeZOrderCommand } from "@app/tools/pdfTextEditor/v2/commands/ChangeZOrderCommand";
import { Page } from "@app/tools/pdfTextEditor/v2/model/Page";
import { ImageObject } from "@app/tools/pdfTextEditor/v2/model/ImageObject";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Fake PDFium module backing the page object list with a plain array of
 * pointers (index 0 = painted first = bottom, last = top). Enough surface for
 * ChangeZOrderCommand: count / get / remove / insert-at-index.
 */
function fakeDoc(objs: number[], page: Page): EditorDocument {
  const module = {
    FPDFPage_CountObjects: () => objs.length,
    FPDFPage_GetObject: (_p: number, i: number) => objs[i] ?? 0,
    FPDFPage_RemoveObject: (_p: number, ptr: number) => {
      const i = objs.indexOf(ptr);
      if (i >= 0) objs.splice(i, 1);
      return true;
    },
    FPDFPage_InsertObjectAtIndex: (_p: number, ptr: number, idx: number) => {
      objs.splice(idx, 0, ptr);
      return true;
    },
  };
  return { module, page: () => page } as unknown as EditorDocument;
}

function pageWithImage(ptr: number): Page {
  const page = new Page({ index: 0, pagePtr: 1, width: 100, height: 100 });
  page.setImages([
    new ImageObject({
      id: "img1",
      pageIndex: 0,
      pdfiumObjPtr: ptr,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
      matrix: { a: 10, b: 0, c: 0, d: 10, e: 0, f: 0 },
    }),
  ]);
  return page;
}

describe("ChangeZOrderCommand", () => {
  it("bring-to-front moves the object to the top AND triggers re-render + regen", () => {
    const page = pageWithImage(42);
    const objs = [42, 7, 9]; // image (42) at bottom, covered by 7 and 9
    const doc = fakeDoc(objs, page);
    const rev0 = page.revision;

    new ChangeZOrderCommand({
      pageIndex: 0,
      imageId: "img1",
      mode: "to-front",
    }).apply(doc);

    expect(objs).toEqual([7, 9, 42]); // now painted last = on top
    // Without these the reorder is invisible (no bitmap re-render) and lost on
    // save (content stream never regenerated) - the reported bug.
    expect(page.revision).toBeGreaterThan(rev0);
    expect(page.needsGenerateContent).toBe(true);
  });

  it("send-to-back moves the object to the bottom", () => {
    const page = pageWithImage(42);
    const objs = [7, 9, 42]; // image on top
    const doc = fakeDoc(objs, page);

    new ChangeZOrderCommand({
      pageIndex: 0,
      imageId: "img1",
      mode: "to-back",
    }).apply(doc);

    expect(objs).toEqual([42, 7, 9]); // painted first = underneath
  });

  it("revert restores the original index and re-renders again", () => {
    const page = pageWithImage(42);
    const objs = [42, 7, 9];
    const doc = fakeDoc(objs, page);
    const cmd = new ChangeZOrderCommand({
      pageIndex: 0,
      imageId: "img1",
      mode: "to-front",
    });
    cmd.apply(doc);
    expect(objs).toEqual([7, 9, 42]);
    const revAfterApply = page.revision;

    cmd.revert(doc);
    expect(objs).toEqual([42, 7, 9]); // back where it started
    expect(page.revision).toBeGreaterThan(revAfterApply);
    expect(page.needsGenerateContent).toBe(true);
  });

  it("already-on-top bring-to-front is a no-op (no spurious revision bump)", () => {
    const page = pageWithImage(42);
    const objs = [7, 9, 42]; // already last
    const doc = fakeDoc(objs, page);
    const rev0 = page.revision;

    new ChangeZOrderCommand({
      pageIndex: 0,
      imageId: "img1",
      mode: "to-front",
    }).apply(doc);

    expect(objs).toEqual([7, 9, 42]);
    expect(page.revision).toBe(rev0);
  });
});
