import { describe, expect, it, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { PdfiumTextReader } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

// Chars 0-4 belong to obj 100, 5-9 to obj 200 (the target), 10-14 to obj 300.
const OBJ_BY_INDEX = [
  100, 100, 100, 100, 100, 200, 200, 200, 200, 200, 300, 300, 300, 300, 300,
];
const TEXTS: Record<number, string> = {
  100: "World",
  200: "Hello",
  300: "Again",
};

function makeRun(id: string, ptr: number, text: string): TextRun {
  return new TextRun({
    id,
    pageIndex: 0,
    pdfiumObjPtr: ptr,
    bounds: { x: 0, y: 0, width: 100, height: 12 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text,
    fontId: "base14:Helvetica",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  });
}

function fakeDoc() {
  // One shared buffer: the loose box is read back through a Float32Array view
  // of HEAPU8 in production, so the fake must write into the same bytes.
  const buffer = new ArrayBuffer(1024);
  const f32 = new Float32Array(buffer);
  const f64 = new Float64Array(buffer);
  let rectCalls = 0;
  let originCalls = 0;
  let unicodeCalls = 0;
  const module = {
    pdfium: {
      wasmExports: {
        malloc: (n: number): number => (n >= 16 ? 16 : 64),
        free: (): void => undefined,
      },
      getValue: (ptr: number, type: string): number =>
        type === "double" ? f64[ptr >> 3] : f32[ptr >> 2],
      HEAPU8: new Uint8Array(buffer),
    },
    FPDFText_CountChars: (): number => OBJ_BY_INDEX.length,
    FPDFText_GetUnicode: (_tp: number, i: number): number => {
      unicodeCalls += 1;
      const obj = OBJ_BY_INDEX[i];
      if (obj === undefined) return 0;
      const text = TEXTS[obj];
      // Per-object char position derived from the index within the object.
      const first = OBJ_BY_INDEX.indexOf(obj);
      return text.charCodeAt(i - first);
    },
    FPDFText_GetTextObject: (_tp: number, i: number): number =>
      OBJ_BY_INDEX[i] ?? 0,
    FPDFText_GetLooseCharBox: (
      _tp: number,
      i: number,
      rect: number,
    ): boolean => {
      rectCalls += 1;
      const base = rect >> 2;
      f32[base] = i * 10;
      f32[base + 2] = i * 10 + 8;
      f32[base + 3] = 0;
      return true;
    },
    FPDFText_GetCharOrigin: (_tp: number, i: number, x: number): boolean => {
      originCalls += 1;
      f64[x >> 3] = i * 10;
      return true;
    },
    FPDFText_LoadPage: (): number => 7,
    FPDFText_ClosePage: vi.fn(),
  };
  return {
    module: module as unknown as WrappedPdfiumModule,
    counts: () => ({ rectCalls, originCalls, unicodeCalls }),
    reset: () => {
      rectCalls = 0;
      originCalls = 0;
      unicodeCalls = 0;
    },
  };
}

function makePage(runs: TextRun[]): Page {
  const page = new Page({ index: 0, pagePtr: 1, width: 612, height: 792 });
  page.setRuns(runs);
  page.loaded = true;
  return page;
}

describe("targeted position recapture", () => {
  it("reads geometry only for the named run", () => {
    const fake = fakeDoc();
    const other = makeRun("other", 100, "World");
    const target = makeRun("target", 200, "Hello");
    const third = makeRun("third", 300, "Again");
    const page = makePage([other, target, third]);

    const changed = PdfiumTextReader.recapturePositions(
      { module: fake.module } as unknown as EditorDocument,
      page,
      [target],
    );

    const counts = fake.counts();
    expect(counts.rectCalls).toBe(5);
    expect(counts.originCalls).toBe(5);
    expect(counts.unicodeCalls).toBe(5);
    expect(changed.has(target)).toBe(true);
    expect(changed.size).toBe(1);
    expect(target.charStartsX?.slice(0, 5)).toEqual([50, 60, 70, 80, 90]);
    expect(other.charStartsX).toBeNull();
  });

  it("falls back to the full page when the run has no visible characters", () => {
    const fake = fakeDoc();
    const other = makeRun("other", 100, "World");
    const ghost = makeRun("ghost", 999, "Lost");
    const page = makePage([other, ghost]);

    const changed = PdfiumTextReader.recapturePositions(
      { module: fake.module } as unknown as EditorDocument,
      page,
      [ghost],
    );

    const counts = fake.counts();
    // Full walk: every char's geometry read, and the visible run captured.
    expect(counts.rectCalls).toBe(OBJ_BY_INDEX.length);
    expect(counts.originCalls).toBe(OBJ_BY_INDEX.length);
    expect(changed.has(other)).toBe(true);
    expect(changed.has(ghost)).toBe(false);
  });

  it("reads the whole page when no run is named", () => {
    const fake = fakeDoc();
    const run = makeRun("target", 200, "Hello");
    const page = makePage([run]);

    const changed = PdfiumTextReader.recapturePositions(
      { module: fake.module } as unknown as EditorDocument,
      page,
    );

    expect(fake.counts().rectCalls).toBe(OBJ_BY_INDEX.length);
    expect(changed.has(run)).toBe(true);
  });
});
