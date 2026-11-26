import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureLocalPdfAccess } from "@editor/services/pdfAccessService";
import {
  addPageNumbersParamsPerFile,
  addPageNumbersToApiParams,
} from "@editor/components/tools/addPageNumbers/useAddPageNumbersOperation";
import {
  defaultParameters,
  validateAddPageNumbersParameters,
  type AddPageNumbersParameters,
} from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";

vi.mock("@editor/services/pdfAccessService", () => ({
  ensureLocalPdfAccess: vi.fn(),
}));
const ensureAccess = vi.mocked(ensureLocalPdfAccess);

const bates: AddPageNumbersParameters = {
  ...defaultParameters,
  numberingStyle: "bates",
  batesPrefix: "ABC",
  batesSuffix: "-X",
  zeroPad: 6,
  startingNumber: 120,
  position: 9,
  customText: "Page {n}",
  pagesToNumber: "2-3",
};

const pdf = (name: string) =>
  new File(["x"], name, { type: "application/pdf" });

const pagesPerFile = (counts: Record<string, number>) =>
  ensureAccess.mockImplementation(
    async (file) =>
      ({ pageCount: counts[(file as File).name] }) as Awaited<
        ReturnType<typeof ensureLocalPdfAccess>
      >,
  );

beforeEach(() => {
  ensureAccess.mockReset();
});

describe("Bates request", () => {
  it("sends prefix + number + suffix, padded, on every page", () => {
    expect(addPageNumbersToApiParams(bates)).toMatchObject({
      customText: "ABC{n}-X",
      zeroPad: 6,
      startingNumber: 120,
      pagesToNumber: "",
      position: 9,
    });
  });

  it("leaves a page-number request as typed", () => {
    expect(
      addPageNumbersToApiParams({ ...bates, numberingStyle: "pageNumbers" }),
    ).toMatchObject({ customText: "Page {n}", pagesToNumber: "2-3" });
  });

  it("needs between 1 and 15 digits", () => {
    expect(validateAddPageNumbersParameters({ ...bates, zeroPad: 0 })).toBe(
      false,
    );
    expect(validateAddPageNumbersParameters({ ...bates, zeroPad: 16 })).toBe(
      false,
    );
    expect(validateAddPageNumbersParameters(bates)).toBe(true);
  });
});

describe("numbering across files", () => {
  it("starts each file one past the last page of the file before it", async () => {
    pagesPerFile({ "a.pdf": 3, "b.pdf": 5, "c.pdf": 2 });

    const perFile = await addPageNumbersParamsPerFile(bates, [
      pdf("a.pdf"),
      pdf("b.pdf"),
      pdf("c.pdf"),
    ]);

    expect(perFile.map((p) => p.startingNumber)).toEqual([120, 123, 128]);
    // The last file's length never affects a later start.
    expect(ensureAccess).toHaveBeenCalledTimes(2);
  });

  it("restarts every file for plain page numbers", async () => {
    const params = { ...bates, numberingStyle: "pageNumbers" as const };

    const perFile = await addPageNumbersParamsPerFile(params, [
      pdf("a.pdf"),
      pdf("b.pdf"),
    ]);

    expect(perFile).toEqual([params, params]);
    expect(ensureAccess).not.toHaveBeenCalled();
  });

  it("fails rather than reuse numbers when a page count is unknown", async () => {
    pagesPerFile({ "a.pdf": 0 });

    await expect(
      addPageNumbersParamsPerFile(bates, [pdf("a.pdf"), pdf("b.pdf")]),
    ).rejects.toThrow("a.pdf");
  });
});
