import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";
import { PDFDocument } from "@app/types/pageEditor";
import {
  BlankTrackPage,
  SourceTrackPage,
  TrackWorkspace,
} from "@app/components/pageTracks/types";
import {
  buildTrackFile,
  buildSelectedPagesFiles,
  policyIdsForPages,
} from "@app/components/pageTracks/buildTrackFile";
import apiClient from "@app/services/apiClient";
import {
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
} from "@app/services/pdfPasswordStore";
import { convertImageToPdf } from "@app/utils/imageToPdfUtils";

const exportPDFMultiFile = vi.hoisted(() => vi.fn());
vi.mock("@app/services/pdfExportService", () => ({
  pdfExportService: { exportPDFMultiFile },
}));
vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@app/utils/imageToPdfUtils", () => ({ convertImageToPdf: vi.fn() }));

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

const readText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

describe("buildTrackFile with images and protected PDFs", () => {
  beforeEach(() => {
    clearPdfAccess();
    vi.clearAllMocks();
    exportPDFMultiFile.mockResolvedValue({ blob: new Blob(["merged"]) });
  });
  afterEach(clearPdfAccess);

  it.each([A, B])(
    "converts image pages and restores PDF protection with %s as the anchor",
    async (anchor) => {
      const image = new File(["image"], "photo.png", { type: "image/png" });
      const protectedPdf = new File(["encrypted"], "locked.pdf", {
        type: "application/pdf",
      });
      const imagePdf = new File(["image PDF"], "photo.pdf", {
        type: "application/pdf",
      });
      const access = {
        password: "password",
        encrypted: true,
        signed: false,
        ownerAuthenticated: false,
        permissions: -4,
        canModify: true,
        canAssemble: true,
        pageCount: 1,
      };
      rememberPdfAccess(protectedPdf, access);
      vi.mocked(convertImageToPdf).mockResolvedValue(imagePdf);
      vi.mocked(apiClient.post)
        .mockResolvedValueOnce({ data: new Blob(["decrypted"]) })
        .mockResolvedValueOnce({ data: new Blob(["protected result"]) });
      const files = new Map([
        [A, image],
        [B, protectedPdf],
      ]);
      const built = await buildTrackFile(
        {
          fileId: anchor,
          name: files.get(anchor)!.name,
          isNew: false,
          pages: [sourcePage("image", A, 1), sourcePage("pdf", B, 1)],
        },
        {
          getFile: (id) => files.get(id),
          getStub: (id) =>
            ({ id, name: files.get(id)!.name }) as StirlingFileStub,
        },
      );

      const sources = exportPDFMultiFile.mock.calls[0][1] as Map<string, File>;
      expect(sources.get(A)).toBe(imagePdf);
      expect(await readText(sources.get(B)!)).toBe("decrypted");
      expect(convertImageToPdf).toHaveBeenCalledExactlyOnceWith(image, {
        pageFormat: "keep",
      });
      expect(apiClient.post).toHaveBeenCalledTimes(2);
      const [endpoint, form] = vi.mocked(apiClient.post).mock.calls[1];
      expect(endpoint).toBe("/api/v1/security/restore-pdf-protection");
      expect((form as FormData).get("sourceFile")).toBe(protectedPdf);
      expect(await readText(built!.file)).toBe("protected result");
      expect(built!.file.name).toBe(anchor === A ? "photo.pdf" : "locked.pdf");
      expect(getPdfAccess(built!.file)).toEqual(access);
    },
  );
});

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
