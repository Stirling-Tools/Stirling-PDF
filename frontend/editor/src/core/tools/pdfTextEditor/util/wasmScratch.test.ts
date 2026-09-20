import { describe, it, expect, vi } from "vitest";
import {
  SCRATCH,
  releaseScratch,
  scratchPtr,
} from "@app/tools/pdfTextEditor/util/wasmScratch";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";

function fakeModule() {
  let next = 1024;
  const malloc = vi.fn((n: number) => {
    const p = next;
    next += n + 16;
    return p;
  });
  const free = vi.fn();
  const m = {
    pdfium: { wasmExports: { malloc, free } },
  } as unknown as WrappedPdfiumModule;
  return { m, malloc, free };
}

describe("scratchPtr", () => {
  it("reuses the same buffer for the same purpose", () => {
    const { m, malloc } = fakeModule();
    const a = scratchPtr(m, SCRATCH.readerCharRect, 16);
    const b = scratchPtr(m, SCRATCH.readerCharRect, 16);
    expect(b).toBe(a);
    expect(malloc).toHaveBeenCalledTimes(1);
  });

  it("keeps different purposes apart", () => {
    const { m, malloc } = fakeModule();
    const rect = scratchPtr(m, SCRATCH.readerCharRect, 16);
    const origin = scratchPtr(m, SCRATCH.readerCharX, 16);
    expect(origin).not.toBe(rect);
    expect(malloc).toHaveBeenCalledTimes(2);
  });

  it("grows a slot and frees the old buffer", () => {
    const { m, malloc, free } = fakeModule();
    const small = scratchPtr(m, SCRATCH.readerBounds, 8);
    const big = scratchPtr(m, SCRATCH.readerBounds, 64);
    expect(big).not.toBe(small);
    expect(free).toHaveBeenCalledWith(small);
    expect(malloc).toHaveBeenLastCalledWith(64);
    expect(scratchPtr(m, SCRATCH.readerBounds, 32)).toBe(big);
    expect(malloc).toHaveBeenCalledTimes(2);
  });

  it("never allocates less than four bytes", () => {
    const { m, malloc } = fakeModule();
    scratchPtr(m, SCRATCH.readerFill, 1);
    expect(malloc).toHaveBeenCalledWith(4);
  });

  it("grows geometrically so a growing text buffer stops re-allocating", () => {
    const { m, malloc } = fakeModule();
    for (let bytes = 4; bytes <= 4096; bytes += 4) {
      scratchPtr(m, SCRATCH.editRunText, bytes);
    }
    // Doubling from 4 to 4096 is 11 allocations; fitting exactly would be 1024.
    expect(malloc.mock.calls.length).toBeLessThanOrEqual(12);
  });

  it("keeps arenas per module", () => {
    const a = fakeModule();
    const b = fakeModule();
    scratchPtr(a.m, SCRATCH.readerCharRect, 16);
    scratchPtr(b.m, SCRATCH.readerCharRect, 16);
    expect(a.malloc).toHaveBeenCalledTimes(1);
    expect(b.malloc).toHaveBeenCalledTimes(1);
  });

  it("releases every slot and re-allocates on next use", () => {
    const { m, malloc, free } = fakeModule();
    const rect = scratchPtr(m, SCRATCH.readerCharRect, 16);
    const fill = scratchPtr(m, SCRATCH.readerFill, 16);
    releaseScratch(m);
    expect(free).toHaveBeenCalledWith(rect);
    expect(free).toHaveBeenCalledWith(fill);
    expect(free).toHaveBeenCalledTimes(2);
    scratchPtr(m, SCRATCH.readerCharRect, 16);
    expect(malloc).toHaveBeenCalledTimes(3);
  });

  it("releases an untouched module without calling free", () => {
    const { m, free } = fakeModule();
    releaseScratch(m);
    expect(free).not.toHaveBeenCalled();
  });
});
