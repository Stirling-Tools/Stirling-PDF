import { describe, expect, it } from "vitest";
import {
  journalIsReversible,
  pageObjectIndexer,
  reverseJournal,
  type PartialEditJournal,
} from "@editor/tools/pdfTextEditor/commands/partialEdit";

type Module = Parameters<typeof reverseJournal>[0];

const PAGE = 3;

/** A page's object list plus each object's horizontal offset. */
function makePage(initial: number[], withInsertAtIndex = true) {
  const objects = [...initial];
  const x = new Map<number, number>(initial.map((ptr) => [ptr, 0]));
  const m = {
    pdfium: {
      wasmExports: { malloc: () => 16, free: () => {} },
      getValue: () => 0,
    },
    FPDFPage_CountObjects: (page: number) =>
      page === PAGE ? objects.length : 0,
    FPDFPage_GetObject: (page: number, i: number) =>
      page === PAGE ? (objects[i] ?? 0) : 0,
    FPDFPage_RemoveObject: (page: number, ptr: number) => {
      const i = objects.indexOf(ptr);
      if (page !== PAGE || i < 0) return false;
      objects.splice(i, 1);
      return true;
    },
    FPDFPage_InsertObject: (page: number, ptr: number) => {
      if (page === PAGE) objects.push(ptr);
    },
    ...(withInsertAtIndex
      ? {
          FPDFPage_InsertObjectAtIndex: (
            page: number,
            ptr: number,
            index: number,
          ) => {
            if (page !== PAGE) return false;
            objects.splice(index, 0, ptr);
            return true;
          },
        }
      : {}),
    FPDFPageObj_Transform: (
      ptr: number,
      _a: number,
      _b: number,
      _c: number,
      _d: number,
      e: number,
    ) => {
      x.set(ptr, (x.get(ptr) ?? 0) + e);
    },
  };
  return { m: m as unknown as Module, objects, x };
}

describe("pageObjectIndexer", () => {
  it("reports positions as they were when first asked", () => {
    const page = makePage([10, 20, 30]);
    const indexOf = pageObjectIndexer(page.m, PAGE);
    expect(indexOf(20)).toBe(1);
    page.m.FPDFPage_RemoveObject(PAGE, 10);
    expect(indexOf(30)).toBe(2);
    expect(indexOf(99)).toBe(-1);
  });
});

describe("reverseJournal", () => {
  it("puts detached objects back at their original positions", () => {
    const page = makePage([10, 20, 30, 40, 50]);
    const indexOf = pageObjectIndexer(page.m, PAGE);
    const journal: PartialEditJournal = {
      shifted: [],
      detached: [40, 20].map((ptr) => ({
        ptr,
        containerPtr: 0,
        index: indexOf(ptr),
      })),
    };
    for (const { ptr } of journal.detached)
      page.m.FPDFPage_RemoveObject(PAGE, ptr);
    reverseJournal(page.m, PAGE, journal);
    expect(page.objects).toEqual([10, 20, 30, 40, 50]);
  });

  it("moves shifted objects back by the same amount", () => {
    const page = makePage([10, 20]);
    const journal: PartialEditJournal = {
      shifted: [
        { ptr: 20, dx: 4.5 },
        { ptr: 20, dx: -1 },
      ],
      detached: [],
    };
    for (const { ptr, dx } of journal.shifted)
      page.m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, dx, 0);
    reverseJournal(page.m, PAGE, journal);
    expect(page.x.get(20)).toBeCloseTo(0);
  });

  it("appends when the build has no insert-at-index", () => {
    const page = makePage([10, 20, 30], false);
    page.m.FPDFPage_RemoveObject(PAGE, 20);
    reverseJournal(page.m, PAGE, {
      shifted: [],
      detached: [{ ptr: 20, containerPtr: 0, index: 1 }],
    });
    expect(page.objects).toEqual([10, 30, 20]);
  });
});

describe("journalIsReversible", () => {
  it("accepts page objects with a known position", () => {
    expect(
      journalIsReversible({
        shifted: [{ ptr: 1, dx: 2 }],
        detached: [{ ptr: 1, containerPtr: 0, index: 0 }],
      }),
    ).toBe(true);
  });

  it("rejects objects taken out of a form XObject", () => {
    expect(
      journalIsReversible({
        shifted: [],
        detached: [{ ptr: 1, containerPtr: 7, index: 0 }],
      }),
    ).toBe(false);
  });

  it("rejects objects whose position was not found", () => {
    expect(
      journalIsReversible({
        shifted: [],
        detached: [{ ptr: 1, containerPtr: 0, index: -1 }],
      }),
    ).toBe(false);
  });
});
