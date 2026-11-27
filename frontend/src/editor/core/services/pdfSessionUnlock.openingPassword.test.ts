import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfErrorCode } from "@embedpdf/models";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  clearPdfAccess,
  inspectLocalPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import { preflightPdfOperation } from "@editor/services/pdfSessionUnlock";

vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@editor/utils/pdfCipherProfile", () => ({
  readCipherProfile: vi.fn(async () => "AES-256"),
}));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  inspectLocalPdfAccess: vi.fn(),
}));

const inspect = vi.mocked(inspectLocalPdfAccess);
const merge = "/api/v1/general/merge-pdfs";
const reader: PdfAccess = {
  password: "reader",
  encrypted: true,
  requiresOpeningPassword: true,
  signed: false,
  ownerAuthenticated: false,
  permissions: -4,
  encryptionRevision: 6,
  pageCount: 1,
};
const owner: PdfAccess = {
  ...reader,
  password: "owner",
  ownerAuthenticated: true,
};
const wrongPassword = Object.assign(new Error("wrong password"), {
  code: PdfErrorCode.Password,
});

function lockedPdf(name: string) {
  return createStirlingFile(
    new File(["encrypted"], `${name}.pdf`, { type: "application/pdf" }),
  );
}

function openedWithReaderThenOwner(name: string) {
  const file = lockedPdf(name);
  rememberPdfAccess(file, reader);
  rememberPdfAccess(file, owner);
  return file;
}

function openedWithOwner(name: string) {
  const file = lockedPdf(name);
  rememberPdfAccess(file, owner);
  return file;
}

beforeEach(() => {
  inspect.mockReset();
  clearPdfAccess();
});
afterEach(clearPdfAccess);

describe("merging PDFs that need an opening password", () => {
  it.each([
    [
      "reader first",
      () => [openedWithReaderThenOwner("a"), openedWithOwner("b")],
    ],
    [
      "owner first",
      () => [openedWithOwner("b"), openedWithReaderThenOwner("a")],
    ],
  ])(
    "admits identical protection whichever way each was unlocked, %s",
    async (_order, select) => {
      inspect.mockResolvedValue(reader);
      const files = select();
      await expect(
        preflightPdfOperation(files, merge, true, vi.fn()),
      ).resolves.toBe(true);
      expect(inspect).toHaveBeenCalledExactlyOnceWith(
        files.find((file) => file.name === "b.pdf"),
        "reader",
        undefined,
      );
    },
  );

  it("refuses when the known opening password does not open the other file", async () => {
    inspect.mockRejectedValue(wrongPassword);
    await expect(
      preflightPdfOperation(
        [openedWithReaderThenOwner("a"), openedWithOwner("b")],
        merge,
        true,
        vi.fn(),
      ),
    ).rejects.toThrow("separate protection settings");
  });

  it("refuses when the known opening password only opens the other file as its owner", async () => {
    inspect.mockResolvedValue(owner);
    await expect(
      preflightPdfOperation(
        [openedWithReaderThenOwner("a"), openedWithOwner("b")],
        merge,
        true,
        vi.fn(),
      ),
    ).rejects.toThrow("separate protection settings");
  });

  it("refuses when no file's opening password is known", async () => {
    await expect(
      preflightPdfOperation(
        [openedWithOwner("a"), openedWithOwner("b")],
        merge,
        true,
        vi.fn(),
      ),
    ).rejects.toThrow("separate protection settings");
    expect(inspect).not.toHaveBeenCalled();
  });
});
