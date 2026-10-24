// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PdfErrorCode } from "@embedpdf/models";
import { createStirlingFile } from "@app/types/fileContext";
import {
  ensureLocalPdfAccess,
  getPdfAccess,
} from "@app/services/pdfAccessService";
import {
  preflightPdfOperation,
  prepareUnlockedFile,
} from "@app/services/pdfSessionUnlock";

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@app/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/pdfAccessService")>()),
  ensureLocalPdfAccess: vi.fn(),
}));
const inspect = vi.mocked(ensureLocalPdfAccess);
const repair = "/api/v1/misc/repair";
const unparseable = () =>
  Object.assign(new Error("Unable to open PDF"), {
    code: PdfErrorCode.WrongFormat,
  });
const pdf = (body: string) =>
  createStirlingFile(
    new File([body], "damaged.pdf", { type: "application/pdf" }),
  );

beforeEach(() => {
  inspect.mockReset();
});

describe("damaged PDFs", () => {
  it("passes unparseable bytes without an encryption hint to the server", async () => {
    inspect.mockImplementation(async () => {
      throw unparseable();
    });
    const file = pdf("%PDF-1.7 truncated");
    await expect(prepareUnlockedFile(file, repair)).resolves.toBe(file);
    await expect(
      preflightPdfOperation([file], repair, false, vi.fn()),
    ).resolves.toBe(true);
    // Nothing proved these bytes unencrypted, so no access is recorded.
    expect(getPdfAccess(file)).toBeUndefined();
  });

  it("still blocks unparseable bytes that look encrypted", async () => {
    inspect.mockImplementation(async () => {
      throw unparseable();
    });
    const file = pdf("%PDF-1.7 trailer << /Encrypt 5 0 R >>");
    await expect(prepareUnlockedFile(file, repair)).rejects.toThrow(
      "Unable to open PDF",
    );
  });

  it.each([
    ["a timeout", new DOMException("timed out", "TimeoutError")],
    ["a password failure", Object.assign(new Error("x"), { code: 4 })],
    ["a memory failure", new Error("Unable to allocate memory for this PDF")],
  ])("does not treat %s as damage", async (_, error) => {
    inspect.mockImplementation(async () => {
      throw error;
    });
    await expect(prepareUnlockedFile(pdf("%PDF-1.7"), repair)).rejects.toBe(
      error,
    );
  });
});
