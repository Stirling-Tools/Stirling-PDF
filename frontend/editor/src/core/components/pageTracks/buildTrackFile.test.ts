import { beforeEach, describe, expect, it, vi } from "vitest";

import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";
import { PDFDocument } from "@app/types/pageEditor";
import {
  BlankTrackPage,
  SourceTrackPage,
  TrackWorkspace,
} from "@app/components/pageTracks/types";
import {
  buildSelectedPagesFiles,
  policyIdsForPages,
} from "@app/components/pageTracks/buildTrackFile";

const exportPDFMultiFile = vi.hoisted(() => vi.fn());
vi.mock("@app/services/pdfExportService", () => ({
  pdfExportService: { exportPDFMultiFile },
}));

const A = "file-a" as FileId;
const B = "file-b" as FileId;
const SPLIT = "split-1" as FileId;

const sourcePage = (
  id: string,
  sourceFileId: FileId,
  sourcePageNumber: number,
  rotation = 0,
): SourceTrackPage => ({
  kind: "source",
  id,
  sourceFileId,
  sourcePageNumber,
  sourceContentKey: "v1",
  rotation,
  width: 0,
  height: 0,
});

const blankPage = (id: string): BlankTrackPage => ({
  kind: "blank",
  id,
  rotation: 0,
  width: 595,
  height: 842,
});

const workspace: TrackWorkspace = {
  order: [B, A, SPLIT],
  tracks: {
    [A]: {
      fileId: A,
      name: "a.pdf",
      isNew: false,
      pages: [sourcePage("a1", A, 1), sourcePage("a2", A, 2, 90)],
    },
    [B]: {
      fileId: B,
      name: "b.pdf",
      isNew: false,
      pages: [
        sourcePage("b1", B, 1),
        blankPage("blank-b"),
        sourcePage("a3", A, 3),
      ],
    },
    [SPLIT]: {
      fileId: SPLIT,
      name: "a (2).pdf",
      isNew: true,
      splitFromFileId: A,
      pages: [blankPage("blank-split")],
    },
  },
};

const lookup = {
  getStub: (id: FileId) =>
    ({ id, name: `${id}.pdf` }) as unknown as StirlingFileStub,
  getFile: (id: FileId) => new File([id], `${id}.pdf`),
};

const exportedPageIds = (call: number): string[] =>
  (exportPDFMultiFile.mock.calls[call][0] as PDFDocument).pages.map(
    (page) => page.id,
  );

describe("buildSelectedPagesFiles", () => {
  beforeEach(() => {
    exportPDFMultiFile.mockReset();
    exportPDFMultiFile.mockResolvedValue({ blob: new Blob(["%PDF"]) });
  });

  it("writes one file per page in workspace order, named by track and position", async () => {
    const built = await buildSelectedPagesFiles(
      workspace,
      new Set(["a2", "a3", "b1"]),
      "eachPage",
      lookup,
    );

    expect(built.map(({ file }) => file.name)).toEqual([
      "b (page 1).pdf",
      "b (page 3).pdf",
      "a (page 2).pdf",
    ]);
    expect(built.map(({ parentStub }) => parentStub.id)).toEqual([B, A, A]);
    expect([0, 1, 2].map(exportedPageIds)).toEqual([["b1"], ["a3"], ["a2"]]);
    const [page] = (exportPDFMultiFile.mock.calls[2][0] as PDFDocument).pages;
    expect(page).toMatchObject({
      originalFileId: A,
      originalPageNumber: 2,
      rotation: 90,
    });
  });

  it("merges pages from every track into one file named after the first", async () => {
    const built = await buildSelectedPagesFiles(
      workspace,
      new Set(["a2", "blank-b", "b1"]),
      "oneFile",
      lookup,
    );

    expect(built.map(({ file }) => file.name)).toEqual([
      "b (selected pages).pdf",
    ]);
    expect(exportedPageIds(0)).toEqual(["b1", "blank-b", "a2"]);
    const sourceFiles = exportPDFMultiFile.mock.calls[0][1] as Map<
      string,
      File
    >;
    expect([...sourceFiles.keys()].sort()).toEqual([A, B]);
  });

  it("parents a blank page in a split to the file it was cut from", async () => {
    const built = await buildSelectedPagesFiles(
      workspace,
      new Set(["blank-split"]),
      "eachPage",
      lookup,
    );

    expect(built.map(({ file }) => file.name)).toEqual(["a (2) (page 1).pdf"]);
    expect(built[0]?.parentStub.id).toBe(A);
  });

  it("writes nothing when no selected page is still open", async () => {
    expect(
      await buildSelectedPagesFiles(
        workspace,
        new Set(["gone"]),
        "oneFile",
        lookup,
      ),
    ).toEqual([]);
    expect(exportPDFMultiFile).not.toHaveBeenCalled();
  });
});

describe("policyIdsForPages", () => {
  it("covers only the files the selected pages copy from", () => {
    const ids = policyIdsForPages(
      workspace,
      new Set(["a1", "blank-b"]),
      (id) => ({ id }) as unknown as StirlingFileStub,
    );
    expect(ids).toContain(A);
    expect(ids).not.toContain(B);
  });
});
