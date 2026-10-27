import { describe, expect, it } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { PdfPermissionFlag as Permission } from "@embedpdf/models";
import { readPdfiumAccess } from "@editor/utils/pdfiumAccess";
import { pdfAllows, canPrintPdf } from "@editor/services/pdfPermissions";

function moduleFor(
  permissions: number,
  owner = false,
  revision = 6,
  signatures = 0,
) {
  return {
    EPDF_IsEncrypted: () => true,
    EPDF_IsOwnerUnlocked: () => owner,
    FPDF_GetDocUserPermissions: () => permissions,
    FPDF_GetSecurityHandlerRevision: () => revision,
    FPDF_GetSignatureCount: () => signatures,
    FPDF_GetPageCount: () => 3,
  } as unknown as WrappedPdfiumModule;
}

describe("PDFium access decisions", () => {
  it("does not confuse unrestricted reader permissions with owner authentication", () => {
    const access = readPdfiumAccess(moduleFor(-4), 1, "reader");
    expect(access.ownerAuthenticated).toBe(false);
    expect(access.openingAuthenticated).toBe(true);
  });

  it("preserves stored restrictions when the owner is authenticated", () => {
    const access = readPdfiumAccess(moduleFor(0, true), 1, "owner");
    expect(access.permissions).toBe(0);
    expect(access.ownerAuthenticated).toBe(true);
    expect(access.openingAuthenticated).toBeUndefined();
    expect(pdfAllows(access, Permission.CopyContents)).toBe(true);
  });

  it.each([2, 3, 4, 6])(
    "interprets revision %i assembly and printing rules",
    (revision) => {
      const access = readPdfiumAccess(
        moduleFor(
          Permission.Print | Permission.ModifyContents,
          false,
          revision,
        ),
        1,
        "reader",
      );
      expect(pdfAllows(access, Permission.AssembleDocument)).toBe(
        revision === 2,
      );
      expect(canPrintPdf(access)).toBe(revision === 2);
      expect(pdfAllows(access, Permission.CopyContents)).toBe(false);
    },
  );

  it("reads signature presence and rejects an unreadable signature count", () => {
    expect(
      readPdfiumAccess(moduleFor(-4, false, 6, 1), 1, "reader").signed,
    ).toBe(true);
    expect(() =>
      readPdfiumAccess(moduleFor(-4, false, 6, -1), 1, "reader"),
    ).toThrow("verify PDF security");
  });
});
