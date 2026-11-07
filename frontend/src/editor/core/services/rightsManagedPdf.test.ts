// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";
import apiClient from "@editor/services/apiClient";
import {
  getPdfAccess,
  inspectLocalPdfAccess,
  rememberPdfAccess,
  rememberUnencryptedPdf,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  accessForProtection,
  clearRightsManagedPdfs,
  forgetRightsManagedPdfs,
  getOpenedRightsManagedPdf,
  isKnownRightsManagedPdf,
  isMicrosoftProtectedPdf,
  openRightsManagedPdf,
  openWithOnlyConnectedAccount,
  RightsManagementError,
  rightsManagedSaveBlocked,
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
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  inspectLocalPdfAccess: vi.fn(),
}));
const inspect = vi.mocked(inspectLocalPdfAccess);
const post = vi.mocked(apiClient.post);
const get = vi.mocked(apiClient.get);
const rotate = "/api/v1/general/rotate-pdf";
const merge = "/api/v1/general/merge-pdfs";
const plaintextAccess: PdfAccess = {
  password: "",
  encrypted: false,
  signed: false,
  ownerAuthenticated: false,
  permissions: -1,
  pageCount: 1,
};

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

function openResponse(
  permissions: Partial<RightsManagedProtection["permissions"]>,
) {
  return {
    data: new Blob(["%PDF-1.7 plaintext"]),
    headers: {
      "x-stirling-protection": protectionHeader(protection(permissions)),
    },
  };
}

function statusWith(
  accounts: { id: number; status: string }[],
  available = true,
) {
  get.mockResolvedValue({
    data: {
      enabled: available,
      available,
      accounts: accounts.map((account) => ({
        ...account,
        email: `user${account.id}@contoso.com`,
      })),
    },
  });
}

async function lockedFile(name = "secret.pdf") {
  return createStirlingFile(
    new File([await wrapper("MicrosoftIRMServices")], name, {
      type: "application/pdf",
    }),
  );
}

async function openedFile(
  permissions: Partial<RightsManagedProtection["permissions"]>,
) {
  const original = await lockedFile();
  post.mockResolvedValueOnce(openResponse(permissions));
  await openRightsManagedPdf(original, 7);
  return original;
}

function preflight(
  files: Parameters<typeof preflightPdfOperation>[0],
  endpoint = rotate,
  combinesFiles = false,
) {
  return preflightPdfOperation(
    files,
    endpoint,
    combinesFiles,
    async () => true,
  );
}

beforeEach(() => {
  post.mockReset();
  get.mockReset();
  inspect.mockReset();
  inspect.mockResolvedValue(plaintextAccess);
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

  it("remembers which library files are protected so their rows can say so", async () => {
    const file = await lockedFile("a.pdf");
    expect(isKnownRightsManagedPdf(file.fileId)).toBe(false);
    await isMicrosoftProtectedPdf(file);
    expect(isKnownRightsManagedPdf(file.fileId)).toBe(true);
    forgetRightsManagedPdfs([file.fileId]);
    expect(isKnownRightsManagedPdf(file.fileId)).toBe(false);
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
    const original = await lockedFile();
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

  it("blocks saving a copy only when the rights forbid export", async () => {
    const viewOnly = await openedFile({});
    expect(rightsManagedSaveBlocked(viewOnly)).toBe(true);
    const exportable = await openedFile({ export: true });
    expect(rightsManagedSaveBlocked(exportable)).toBe(false);
    expect(rightsManagedSaveBlocked(exportable.fileId)).toBe(false);
    expect(rightsManagedSaveBlocked(undefined)).toBe(false);
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
  it("opens the document with the only connected Microsoft account", async () => {
    statusWith([{ id: 7, status: "CONNECTED" }]);
    post.mockResolvedValueOnce(openResponse({ edit: true }));
    const file = await lockedFile();
    await preflight([file]);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/rights-management/open",
      expect.any(FormData),
      expect.objectContaining({ params: { accountId: 7 } }),
    );
    expect(getOpenedRightsManagedPdf(file)?.accountId).toBe(7);
  });

  it("opens each selected document only once when several callers ask together", async () => {
    statusWith([{ id: 7, status: "CONNECTED" }]);
    post.mockResolvedValue(openResponse({ edit: true }));
    const board = await lockedFile("board.pdf");
    const minutes = await lockedFile("minutes.pdf");
    await Promise.all([
      openWithOnlyConnectedAccount(board),
      openWithOnlyConnectedAccount(board),
      openWithOnlyConnectedAccount(minutes),
    ]);
    expect(post).toHaveBeenCalledTimes(2);
    expect(getOpenedRightsManagedPdf(board)).toBeTruthy();
    expect(getOpenedRightsManagedPdf(minutes)).toBeTruthy();
  });

  it.each([
    {
      situation: "more than one Microsoft account is connected",
      accounts: [
        { id: 7, status: "CONNECTED" },
        { id: 8, status: "CONNECTED" },
      ],
      available: true,
      message: "Open this Microsoft Purview protected PDF",
    },
    {
      situation: "the server cannot open protected PDFs",
      accounts: [],
      available: false,
      message: "This server cannot open Microsoft Purview protected PDFs",
    },
    {
      situation: "no Microsoft account is connected",
      accounts: [{ id: 7, status: "EXPIRED" }],
      available: true,
      message: "Sign in with Microsoft in the viewer",
    },
  ])(
    "tells the user what to do when $situation",
    async ({ accounts, available, message }) => {
      statusWith(accounts, available);
      await expect(preflight([await lockedFile()])).rejects.toThrow(message);
      expect(post).not.toHaveBeenCalled();
    },
  );

  it("names the protected files when a tool would combine them", async () => {
    await expect(
      preflight(
        [await lockedFile("board.pdf"), await lockedFile("minutes.pdf")],
        "/api/v1/general/merge-pdfs",
        true,
      ),
    ).rejects.toThrow("Protected files: board.pdf, minutes.pdf.");
  });

  it("refuses when the user's rights do not include editing", async () => {
    const original = await openedFile({});
    await expect(preflight([original])).rejects.toThrow("do not allow changes");
  });

  it.each([
    ["/api/v1/security/add-watermark"],
    ["/api/v1/misc/add-stamp"],
    ["/api/v1/misc/ocr-pdf"],
    ["/api/v1/security/sanitize-pdf"],
  ])("runs %s, which takes and returns PDFs", async (endpoint) => {
    const original = await openedFile({ edit: true });
    await expect(preflight([original], endpoint)).resolves.toBe(true);
    const working = await prepareUnlockedFile(original, endpoint);
    expect(await working.text()).toBe("%PDF-1.7 plaintext");
  });

  it.each([
    ["/api/v1/convert/pdf/img", "doesn't make PDFs"],
    ["/api/v1/security/add-password", "sensitivity label"],
    ["/api/v1/security/cert-sign", "digitally signed PDF"],
    ["/api/v1/ai/tools/classify-and-label", "AI engine"],
    ["/api/v1/misc/add-attachments", "attachments"],
    [undefined, "cannot keep Microsoft Purview protection"],
  ])("refuses %s and says why", async (endpoint, reason) => {
    const original = await openedFile({ edit: true });
    await expect(
      preflightPdfOperation([original], endpoint, false, async () => true),
    ).rejects.toThrow(reason);
    await expect(prepareUnlockedFile(original, endpoint)).rejects.toThrow(
      reason,
    );
  });

  it("needs the copy right for a tool that names the file from its text", async () => {
    const autoRename = "/api/v1/misc/auto-rename";
    await expect(
      preflight([await openedFile({ edit: true })], autoRename),
    ).rejects.toThrow("copying");
    await expect(
      preflight([await openedFile({ edit: true, copy: true })], autoRename),
    ).resolves.toBe(true);
  });

  it("leaves digitally signed content view-only", async () => {
    const original = await openedFile({ edit: true });
    inspect.mockResolvedValue({ ...plaintextAccess, signed: true });
    await expect(preflight([original])).rejects.toThrow("digital signatures");
    await expect(prepareUnlockedFile(original, rotate)).rejects.toThrow(
      "digital signatures",
    );
  });

  it("will not combine Purview protection with a password-protected PDF", async () => {
    const original = await openedFile({ edit: true });
    const locked = createStirlingFile(
      new File(["%PDF-1.7 encrypted"], "locked.pdf", {
        type: "application/pdf",
      }),
    );
    rememberPdfAccess(locked, {
      ...plaintextAccess,
      password: "reader",
      encrypted: true,
    });
    await expect(preflight([original, locked], merge, true)).rejects.toThrow(
      "password-protected",
    );
    await expect(
      protectUnlockedResults(
        [new File(["%PDF"], "merged.pdf", { type: "application/pdf" })],
        [original, locked],
        merge,
      ),
    ).rejects.toThrow("password-protected");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("runs on the decrypted copy and re-protects every result like the original", async () => {
    const original = await openedFile({ edit: true });
    rememberUnencryptedPdf(original, 1);
    await expect(preflight([original])).resolves.toBe(true);

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
    const sentOriginal = (form as FormData).get("original") as File;
    const sentOutput = (form as FormData).get("fileInput") as File;
    expect(sentOriginal.name).toBe(original.name);
    expect(await sentOriginal.text()).toBe(await original.text());
    expect(sentOutput.name).toBe(output.name);
    expect(await sentOutput.text()).toBe("%PDF-1.7 rotated");
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
