import { describe, expect, it } from "vitest";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";

function page(): Page {
  return new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
}

const box = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

describe("Page repaint area", () => {
  it("is the noted area for a bitmap painted just before the edit", () => {
    const p = page();
    p.markDirty();
    const from = p.revision;
    p.markDirty();
    p.markDirty();
    p.noteRepaintArea(from, p.revision, box(10, 20, 30, 40));

    expect(p.repaintAreaSince(from)).toEqual(box(10, 20, 30, 40));
    expect(p.repaintAreaSince(from + 1)).toEqual(box(10, 20, 30, 40));
  });

  it("grows to cover consecutive edits", () => {
    const p = page();
    const start = p.revision;
    p.markDirty();
    p.noteRepaintArea(start, p.revision, box(10, 10, 10, 10));
    const middle = p.revision;
    p.markDirty();
    p.noteRepaintArea(middle, p.revision, box(50, 5, 10, 10));

    expect(p.repaintAreaSince(start)).toEqual(box(10, 5, 50, 15));
  });

  it("leaves out edits the bitmap already shows", () => {
    const p = page();
    const start = p.revision;
    p.markDirty();
    p.noteRepaintArea(start, p.revision, box(0, 0, 10, 10));
    const painted = p.revision;
    p.markDirty();
    p.noteRepaintArea(painted, p.revision, box(500, 700, 10, 10));

    expect(p.repaintAreaSince(painted)).toEqual(box(500, 700, 10, 10));
  });

  it("asks for the whole page after a change nobody bounded", () => {
    const p = page();
    const from = p.revision;
    p.markDirty();
    p.noteRepaintArea(from, p.revision, box(10, 10, 10, 10));
    p.bumpRevision();

    expect(p.repaintAreaSince(from)).toBeNull();
  });

  it("asks for the whole page for a bitmap older than the noted span", () => {
    const p = page();
    p.markDirty();
    const from = p.revision;
    p.markDirty();
    p.noteRepaintArea(from, p.revision, box(10, 10, 10, 10));

    expect(p.repaintAreaSince(from - 1)).toBeNull();
    expect(p.repaintAreaSince(p.revision)).toBeNull();
  });

  it("starts a fresh area when an edit does not follow the last one", () => {
    const p = page();
    const first = p.revision;
    p.markDirty();
    p.noteRepaintArea(first, p.revision, box(10, 10, 10, 10));
    p.bumpRevision();
    const second = p.revision;
    p.markDirty();
    p.noteRepaintArea(second, p.revision, box(200, 200, 5, 5));

    expect(p.repaintAreaSince(first)).toBeNull();
    expect(p.repaintAreaSince(second)).toEqual(box(200, 200, 5, 5));
  });
});
