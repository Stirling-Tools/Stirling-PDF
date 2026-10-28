// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";
import apiClient from "@editor/services/apiClient";
import {
  getPdfAccess,
  rememberUnencryptedPdf,
} from "@editor/services/pdfAccessService";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  accessForProtection,
  clearRightsManagedPdfs,
  forgetRightsManagedPdfs,
  getOpenedRightsManagedPdf,
  isMicrosoftProtectedPdf,
  openRightsManagedPdf,
  RightsManagementError,
  type RightsManagedProtection,
} from "@editor/services/rightsManagedPdf";
import {
  preflightPdfOperation,
  prepareUnlockedFile,
  protectUnlockedResults,
} from "@editor/services/pdfSessionUnlock";
import { PdfPermissionFlag } from "@editor/contexts/viewer/viewerBridges";
import { pdfAllows } from "@editor/services/pdfPermissions";

vi.mock("@editor/services/apiClient", () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));
const post = vi.mocked(apiClient.post);
const rotate = "/api/v1/general/rotate-pdf";

async function wrapper(
  subtype: string,
  options: { objectStreams?: boolean; version?: string } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const context = doc.context;
  const payload = context.flateStream(new Uint8Array([1, 2, 3]), {
    Type: "EmbeddedFile",
  });
  const spec = context.obj({
    Type: "Filespec",
    F: PDFString.of("payload.pdf"),
    AFRelationship: "EncryptedPayload",
    EF: { F: context.register(payload) },
    EP: {
      Type: "EncryptedPayload",
      Subtype: subtype,
      Version: PDFString.of("2"),
    },
  });
  doc.catalog.set(PDFName.of("AF"), context.obj([context.register(spec)]));
  const bytes = await doc.save({
    useObjectStreams: options.objectStreams ?? false,
  });
  if (options.version) {
    const header = new TextEncoder().encode(`%PDF-${options.version}`);
    bytes.set(header, 0);
  }
  return new Uint8Array(bytes);
}

function protection(
  permissions: Partial<RightsManagedProtection["permissions"]>,
): RightsManagedProtection {
  return {
    label: {
      id: "l1",
      name: "Confidential",
      parentName: null,
      color: null,
      sensitivity: 2,
    },
    rights: [],
    owner: "alice@contoso.com",
    issuedTo: "bob@contoso.com",
    issuedToOwner: false,
    contentId: "c1",
    custom: false,
    templateId: null,
    templateName: null,
    allowOfflineAccess: false,
    validUntilEpochSeconds: null,
    permissions: {
      view: true,
      print: false,
      copy: false,
      edit: false,
      comment: false,
      export: false,
      owner: false,
      ...permissions,
    },
  };
}

function protectionHeader(value: RightsManagedProtection): string {
  const json = new TextEncoder().encode(JSON.stringify(value));
  return btoa(String.fromCharCode(...json))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function openedFile(
  permissions: Partial<RightsManagedProtection["permissions"]>,
) {
  const original = createStirlingFile(
    new File([await wrapper("MicrosoftIRMServices")], "secret.pdf", {
      type: "application/pdf",
    }),
  );
  post.mockResolvedValueOnce({
    data: new Blob(["%PDF-1.7 plaintext"]),
    headers: {
      "x-stirling-protection": protectionHeader(protection(permissions)),
    },
  });
  await openRightsManagedPdf(original, 7);
  return original;
}

beforeEach(() => {
  post.mockReset();
  clearRightsManagedPdfs();
});
afterEach(clearRightsManagedPdfs);

describe("Microsoft Purview detection", () => {
  it("recognises the Microsoft encrypted payload wrapper", async () => {
    const file = new File([await wrapper("MicrosoftIRMServices")], "a.pdf");
    await expect(isMicrosoftProtectedPdf(file)).resolves.toBe(true);
  });

  it("finds the payload when object streams hide it from a byte scan", async () => {
    const bytes = await wrapper("MicrosoftIRMServices", {
      objectStreams: true,
      version: "2.0",
    });
    expect(new TextDecoder("latin1").decode(bytes)).not.toContain(
      "/MicrosoftIRMServices",
    );
    await expect(
      isMicrosoftProtectedPdf(new File([bytes], "a.pdf")),
    ).resolves.toBe(true);
  });

  it("does not parse a very large file's structure on the main thread", async () => {
    const bytes = await wrapper("MicrosoftIRMServices", {
      objectStreams: true,
      version: "2.0",
    });
    const file = new File([bytes], "huge.pdf");
    Object.defineProperty(file, "size", { value: 65 * 1024 * 1024 });
    await expect(isMicrosoftProtectedPdf(file)).resolves.toBe(false);
  });

  it("does not claim another vendor's encrypted payload", async () => {
    const file = new File([await wrapper("AcmeDRM")], "a.pdf");
    await expect(isMicrosoftProtectedPdf(file)).resolves.toBe(false);
  });

  it("ignores ordinary PDFs", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const file = new File([new Uint8Array(await doc.save())], "plain.pdf");
    await expect(isMicrosoftProtectedPdf(file)).resolves.toBe(false);
  });
});

describe("opening a protected PDF", () => {
  it("keeps the decrypted copy in memory with viewer restrictions from the user's rights", async () => {
    const original = await openedFile({ print: true });

    const opened = getOpenedRightsManagedPdf(original)!;
    expect(opened.accountId).toBe(7);
    expect(await opened.plaintext.text()).toBe("%PDF-1.7 plaintext");
    const access = getPdfAccess(opened.plaintext)!;
    expect(access.honorOwnerPasswords).toBe(true);
    expect(access.permissions & PdfPermissionFlag.Print).toBeTruthy();
    expect(access.permissions & PdfPermissionFlag.CopyContents).toBeFalsy();
    expect(access.permissions & PdfPermissionFlag.ModifyContents).toBeFalsy();
    expect(post.mock.calls[0][0]).toBe("/api/v1/rights-management/open");
    expect(getPdfAccess(original.fileId)).toEqual(access);

    forgetRightsManagedPdfs([original.fileId]);
    expect(getOpenedRightsManagedPdf(original)).toBeUndefined();
  });

  it("reports who to ask when the user has no rights", async () => {
    const original = new File(
      [await wrapper("MicrosoftIRMServices")],
      "secret.pdf",
    );
    post.mockRejectedValueOnce(
      new AxiosError("Forbidden", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 403,
        statusText: "Forbidden",
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: new Blob([
          JSON.stringify({
            code: "no_permissions",
            message: "denied",
            owner: "alice@contoso.com",
          }),
        ]),
      }),
    );

    const error = await openRightsManagedPdf(original).catch((e) => e);

    expect(error).toBeInstanceOf(RightsManagementError);
    expect(error.code).toBe("no_permissions");
    expect(error.owner).toBe("alice@contoso.com");
    expect(getOpenedRightsManagedPdf(original)).toBeUndefined();
  });

  it("keeps Purview rights when the server ignores owner passwords", () => {
    const access = {
      ...accessForProtection(protection({ edit: false, print: false })),
      honorOwnerPasswords: false,
    };
    expect(pdfAllows(access, PdfPermissionFlag.Print)).toBe(false);
    expect(pdfAllows(access, PdfPermissionFlag.ModifyContents)).toBe(false);
  });

  it("maps edit and comment rights onto PDF permission flags", () => {
    const access = accessForProtection(protection({ edit: true, copy: true }));
    expect(access.permissions & PdfPermissionFlag.ModifyContents).toBeTruthy();
    expect(
      access.permissions & PdfPermissionFlag.AssembleDocument,
    ).toBeTruthy();
    expect(access.permissions & PdfPermissionFlag.CopyContents).toBeTruthy();
    expect(access.permissions & PdfPermissionFlag.Print).toBeFalsy();
  });
});

describe("tools on protected PDFs", () => {
  it("refuses to run before the user opens the document", async () => {
    const file = createStirlingFile(
      new File([await wrapper("MicrosoftIRMServices")], "secret.pdf", {
        type: "application/pdf",
      }),
    );
    await expect(
      preflightPdfOperation([file], rotate, false, async () => true),
    ).rejects.toThrow("Open this Microsoft Purview protected PDF");
  });

  it("refuses when the user's rights do not include editing", async () => {
    const original = await openedFile({});
    await expect(
      preflightPdfOperation([original], rotate, false, async () => true),
    ).rejects.toThrow("do not allow changes");
  });

  it("refuses tools that cannot keep the protection", async () => {
    const original = await openedFile({ edit: true });
    await expect(
      preflightPdfOperation(
        [original],
        "/api/v1/convert/pdf/img",
        false,
        async () => true,
      ),
    ).rejects.toThrow("cannot keep Microsoft Purview protection");
  });

  it("runs on the decrypted copy and re-protects every result like the original", async () => {
    const original = await openedFile({ edit: true });
    rememberUnencryptedPdf(original, 1);
    await expect(
      preflightPdfOperation([original], rotate, false, async () => true),
    ).resolves.toBe(true);

    const working = await prepareUnlockedFile(original, rotate);
    expect(await working.text()).toBe("%PDF-1.7 plaintext");

    post.mockResolvedValueOnce({ data: new Blob(["%PDF-2.0 reprotected"]) });
    const output = new File(["%PDF-1.7 rotated"], "secret.pdf", {
      type: "application/pdf",
    });
    const [result] = await protectUnlockedResults([output], [original], rotate);

    expect(await result.text()).toBe("%PDF-2.0 reprotected");
    const reopened = getOpenedRightsManagedPdf(result)!;
    expect(await reopened.plaintext.text()).toBe("%PDF-1.7 rotated");
    expect(reopened.protection.permissions.edit).toBe(true);
    expect(reopened.accountId).toBe(7);
    const [endpoint, form, config] = post.mock.calls[1];
    expect(endpoint).toBe("/api/v1/rights-management/protect");
    expect((form as FormData).get("original")).toBe(original);
    expect((form as FormData).get("fileInput")).toBe(output);
    expect(config?.params).toEqual({ accountId: 7 });
  });

  it("never hands back an unprotected result when re-protection fails", async () => {
    const original = await openedFile({ edit: true });
    post.mockRejectedValueOnce(new Error("network down"));
    await expect(
      protectUnlockedResults(
        [new File(["%PDF"], "out.pdf", { type: "application/pdf" })],
        [original],
        rotate,
      ),
    ).rejects.toThrow("No unprotected result was saved");
  });
});
