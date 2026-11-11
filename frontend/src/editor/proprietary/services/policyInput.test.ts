// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { policyAcceptsFile } from "@editor/services/policyInput";
import {
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";
import {
  accessForProtection,
  type RightsManagedProtection,
} from "@editor/services/rightsManagedPdf";
import {
  createStirlingFile,
  type StirlingFile,
} from "@editor/types/fileContext";
import type { PolicyState } from "@editor/types/policies";

describe("policy input compatibility", () => {
  it.each<[PolicyState["firstOperation"], string, string, boolean]>([
    ["/api/v1/misc/compress-pdf", "report.PDF", "", true],
    ["/api/v1/misc/compress-pdf", "report", "application/pdf", true],
    ["/api/v1/misc/compress-pdf", "scan.png", "image/png", false],
    ["/api/v1/convert/img/pdf", "scan.PNG", "", true],
    ["/api/v1/convert/img/pdf", "scan.svg", "", true],
    ["/api/v1/convert/img/pdf", "report.pdf", "application/pdf", false],
    ["/api/v1/convert/markdown/pdf", "notes.md", "", true],
    ["/api/v1/convert/markdown/pdf", "notes.txt", "", false],
    ["/api/v1/convert/file/pdf", "anything.custom", "", true],
    [null, "report.pdf", "application/pdf", false],
    [undefined, "report.pdf", "application/pdf", false],
  ])("%s selects %s: %s → %s", (firstOperation, name, type, expected) => {
    expect(policyAcceptsFile({ firstOperation }, { name, type })).toBe(
      expected,
    );
  });
});

describe("policy input protection", () => {
  const purviewProtection: RightsManagedProtection = {
    label: null,
    rights: ["EDIT"],
    owner: null,
    issuedTo: null,
    issuedToOwner: false,
    contentId: null,
    custom: false,
    templateId: null,
    templateName: null,
    allowOfflineAccess: false,
    validUntilEpochSeconds: null,
    permissions: {
      view: true,
      print: true,
      copy: true,
      edit: true,
      comment: true,
      export: true,
      owner: false,
    },
  };

  afterEach(() => clearPdfAccess());

  function workspaceFile(name: string): StirlingFile {
    return createStirlingFile(
      new File(["%PDF-1.7"], name, { type: "application/pdf" }),
    );
  }

  function stubOf(file: StirlingFile, isEncrypted: boolean) {
    return {
      id: file.fileId,
      name: file.name,
      type: file.type,
      processedFile: { pages: [], isEncrypted },
    };
  }

  it.each<[PolicyState["firstOperation"], boolean]>([
    ["/api/v1/general/rotate-pdf", false],
    ["/api/v1/misc/compress-pdf", false],
    ["/api/v1/security/remove-password", true],
    ["/api/v1/integration/external-api-call", true],
  ])(
    "judges an unlocked password-protected PDF for %s by its encrypted bytes → %s",
    (firstOperation, expected) => {
      const file = workspaceFile("locked.pdf");
      rememberPdfAccess(file, {
        password: "permissions-secret",
        encrypted: true,
        signed: false,
        ownerAuthenticated: true,
        permissions: -4,
        pageCount: 1,
      });

      expect(getPdfAccess(file.fileId)?.encrypted).toBe(true);
      expect(policyAcceptsFile({ firstOperation }, stubOf(file, true))).toBe(
        expected,
      );
    },
  );

  it.each([false, true])(
    "keeps accepting an opened Microsoft Purview PDF whose stub records isEncrypted %s",
    (isEncrypted) => {
      const file = workspaceFile("secret.pdf");
      rememberPdfAccess(file, accessForProtection(purviewProtection));

      expect(
        policyAcceptsFile(
          { firstOperation: "/api/v1/general/rotate-pdf" },
          stubOf(file, isEncrypted),
        ),
      ).toBe(true);
    },
  );
});
