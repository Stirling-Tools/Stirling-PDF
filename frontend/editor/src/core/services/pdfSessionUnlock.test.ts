import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import axios from "axios";
import JSZip from "jszip";
import { zipFileService } from "@app/services/zipFileService";
import { handlePasswordError } from "@app/utils/toolErrorHandler";
import { createStirlingFile } from "@app/types/fileContext";
import {
  clearPdfAccess,
  forgetPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import {
  prepareUnlockedFile,
  protectUnlockedResults,
  unlockPdfForSession,
  verifyEditedPdfProtection,
  assertPdfSessionEditable,
  preflightPdfOperation,
  changePdfSecurity,
  hasPdfPermissionOverride,
  pdfAllows,
} from "@app/services/pdfSessionUnlock";
import { PdfPermissionFlag } from "@embedpdf/models";

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
const post = vi.mocked(apiClient.post);
const access: PdfAccess = {
  password: " password\n",
  encrypted: true,
  signed: false,
  ownerAuthenticated: false,
  permissions: -4,
  encryptionKeyLength: 256,
  encryptionRevision: 6,
  credentialFingerprint: "source-credentials",
  canModify: true,
  canAssemble: true,
  pageCount: 2,
};
const rotate = "/api/v1/general/rotate-pdf";

beforeEach(() => {
  clearPdfAccess();
  post.mockReset();
});
afterEach(clearPdfAccess);

describe("session PDF access", () => {
  it("preserves cancellation classification without retaining password-bearing requests", async () => {
    const file = new File(["encrypted"], "restricted.pdf");
    rememberPdfAccess(file, { ...access, ownerAuthenticated: true });
    const form = new FormData();
    form.set("ownerPassword", "secret");
    const original = Object.assign(new axios.CanceledError("cancelled"), {
      config: { data: form },
      request: { form },
    });
    post.mockRejectedValueOnce(original);
    const cancellation = axios.CancelToken.source();
    const error = await changePdfSecurity(
      file,
      form,
      "/api/v1/security/add-password",
      cancellation.token,
    ).catch((error: unknown) => error);
    expect(axios.isCancel(error)).toBe(true);
    expect(error).not.toHaveProperty("config");
    expect(error).not.toHaveProperty("request");
    expect(error).not.toHaveProperty("cause");
    expect(post.mock.calls[0][2]?.cancelToken).toBe(cancellation.token);
  });

  it.each([undefined, true, false])(
    "uses the server owner policy (%s) without changing authentication",
    async (honorOwnerPasswords) => {
      const file = createStirlingFile(
        new File(["encrypted"], "restricted.pdf"),
      );
      const reader = {
        ...access,
        permissions: 0,
        canModify: false,
        honorOwnerPasswords,
      };
      rememberPdfAccess(file, reader);
      const requestOwner = vi.fn().mockResolvedValue(false);
      const bypass = honorOwnerPasswords === false;
      expect(hasPdfPermissionOverride(reader)).toBe(bypass);
      for (const flag of [
        PdfPermissionFlag.Print,
        PdfPermissionFlag.PrintHighQuality,
        PdfPermissionFlag.CopyContents,
        PdfPermissionFlag.ModifyContents,
        PdfPermissionFlag.ModifyAnnotations,
        PdfPermissionFlag.FillForms,
        PdfPermissionFlag.AssembleDocument,
        PdfPermissionFlag.ExtractForAccessibility,
      ]) {
        expect(pdfAllows(reader, flag)).toBe(bypass);
      }
      expect(
        await preflightPdfOperation([file], rotate, false, requestOwner),
      ).toBe(bypass);
      expect(
        await preflightPdfOperation(
          [file],
          "/api/v1/security/add-password",
          false,
          requestOwner,
        ),
      ).toBe(bypass);
      if (bypass) {
        expect(requestOwner).not.toHaveBeenCalled();
        expect(() => assertPdfSessionEditable(reader)).not.toThrow();
      } else {
        expect(requestOwner).toHaveBeenCalledTimes(2);
        expect(() => assertPdfSessionEditable(reader)).toThrow();
      }
      expect(getPdfAccess(file)?.ownerAuthenticated).toBe(false);
      expect(() =>
        assertPdfSessionEditable({ ...reader, signed: true }),
      ).toThrow();
    },
  );

  it("keeps removal selections separate from cached credentials in bypass mode", async () => {
    const file = new File(["encrypted"], "restricted.pdf");
    rememberPdfAccess(file, { ...access, honorOwnerPasswords: false });
    post.mockResolvedValue({ data: new Blob(["result"]) });
    const form = new FormData();
    form.set("password", "");
    form.set("ownerPassword", "selected-owner");
    await changePdfSecurity(file, form, "/api/v1/security/remove-password");
    expect(form.get("password")).toBe("");
    expect(form.get("sourcePassword")).toBe(access.password);
    expect(form.get("retainedOpeningPassword")).toBe(access.password);
    expect(form.get("ownerPassword")).toBe("selected-owner");
    expect(post.mock.calls[0][0]).toBe("/api/v1/security/remove-pdf-passwords");
    expect(getPdfAccess(file)?.ownerAuthenticated).toBe(false);
  });

  it("retains the opening credential after separately authenticating the owner", () => {
    const file = new File(["encrypted"], "restricted.pdf");
    rememberPdfAccess(file, { ...access, openingAuthenticated: true });
    expect(getPdfAccess(file)?.ownerAuthenticated).toBe(false);
    rememberPdfAccess(file, {
      ...access,
      password: "owner",
      ownerAuthenticated: true,
      openingAuthenticated: false,
    });
    expect(getPdfAccess(file)?.openingPassword).toBe(access.password);
    expect(getPdfAccess(file)?.password).toBe("owner");
  });

  it("does not infer removal from a cached owner credential or request an unrelated owner prompt", async () => {
    const file = createStirlingFile(new File(["encrypted"], "restricted.pdf"));
    rememberPdfAccess(file, { ...access, ownerAuthenticated: true });
    const requestOwner = vi.fn();
    expect(
      await preflightPdfOperation(
        [file],
        "/api/v1/security/remove-password",
        false,
        requestOwner,
      ),
    ).toBe(true);
    expect(requestOwner).not.toHaveBeenCalled();
    post.mockResolvedValue({ data: new Blob(["result"]) });
    const form = new FormData();
    form.set("password", "selected-opening");
    await changePdfSecurity(file, form, "/api/v1/security/remove-password");
    expect(form.get("password")).toBe("selected-opening");
    expect(form.has("ownerPassword")).toBe(false);
  });

  it("requests owner authority before a restricted operation and stops on cancellation", async () => {
    const file = createStirlingFile(new File(["encrypted"], "restricted.pdf"));
    rememberPdfAccess(file, { ...access, permissions: 0 });
    const requestOwner = vi.fn().mockResolvedValue(false);
    expect(
      await preflightPdfOperation([file], rotate, false, requestOwner),
    ).toBe(false);
    expect(requestOwner).toHaveBeenCalledWith(file);
    expect(post).not.toHaveBeenCalled();
    requestOwner.mockImplementation(async () => {
      rememberPdfAccess(file, { ...access, ownerAuthenticated: true });
      return true;
    });
    expect(
      await preflightPdfOperation([file], rotate, false, requestOwner),
    ).toBe(true);
  });

  it("rejects an unsupported tool or protected merge before asking for a password", async () => {
    const files = ["first", "second"].map((name) =>
      createStirlingFile(new File(["encrypted"], `${name}.pdf`)),
    );
    files.forEach((file) =>
      rememberPdfAccess(file, { ...access, permissions: 0 }),
    );
    const requestOwner = vi.fn();
    await expect(
      preflightPdfOperation(
        files,
        "/api/v1/security/auto-redact",
        false,
        requestOwner,
      ),
    ).rejects.toThrow("cannot yet preserve");
    await expect(
      preflightPdfOperation(
        files,
        "/api/v1/general/merge-pdfs",
        true,
        requestOwner,
      ),
    ).rejects.toThrow("Process them individually");
    expect(requestOwner).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("changes permissions in place using the verified owner rather than requiring a new owner password", async () => {
    const file = new File(["encrypted"], "restricted.pdf");
    rememberPdfAccess(file, { ...access, ownerAuthenticated: true });
    post.mockResolvedValue({ data: new Blob(["protected result"]) });
    const form = new FormData();
    form.set("preventModify", "true");
    await changePdfSecurity(file, form, "/api/v1/security/add-password");
    expect(post.mock.calls[0][0]).toBe(
      "/api/v1/security/change-pdf-permissions",
    );
    expect(form.get("sourcePassword")).toBe(access.password);
    expect(form.has("ownerPassword")).toBe(false);
  });

  it("reuses verified owner access for opening-password removal", async () => {
    const file = new File(["encrypted"], "restricted.pdf");
    rememberPdfAccess(file, { ...access, ownerAuthenticated: true });
    post.mockResolvedValue({ data: new Blob(["result"]) });
    const form = new FormData();
    await changePdfSecurity(file, form, "/api/v1/security/remove-password");
    expect(form.get("sourcePassword")).toBe(access.password);
    expect(form.has("password")).toBe(false);
    expect(post.mock.calls[0][0]).toBe("/api/v1/security/remove-pdf-passwords");
  });
  it("authenticates without rewriting bytes or retaining credentials before adoption", async () => {
    const original = createStirlingFile(new File(["encrypted"], "locked.pdf"));
    const { password, ...info } = access;
    post.mockResolvedValueOnce({ data: info });
    expect(await unlockPdfForSession(original, password)).toEqual(access);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0]).toBe("/api/v1/security/inspect-pdf-security");
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get("fileInput")).toBe(original);
    expect(form.get("password")).toBe(password);
    expect(getPdfAccess(original)).toBeUndefined();
  });

  it("does not cache a rejected password", async () => {
    const original = new File(["encrypted"], "locked.pdf");
    post.mockRejectedValueOnce(new Error("Incorrect password"));
    await expect(unlockPdfForSession(original, "wrong")).rejects.toThrow(
      "Incorrect password",
    );
    expect(getPdfAccess(original)).toBeUndefined();
  });

  it("strips password-bearing request objects while preserving password errors", async () => {
    const form = new FormData();
    form.set("password", "secret");
    const config = { data: form };
    const original = Object.assign(new Error("Bad request"), {
      isAxiosError: true,
      config,
      request: { config },
      response: { status: 400, data: { type: "/errors/pdf-password" }, config },
    });
    post.mockRejectedValueOnce(original);
    const error = await unlockPdfForSession(
      new File(["pdf"], "test.pdf"),
      "secret",
    ).catch((error: unknown) => error);
    expect(error).not.toBe(original);
    expect(error).not.toHaveProperty("config");
    expect(error).not.toHaveProperty("request");
    expect(error).not.toHaveProperty("response.config");
    expect(error).not.toHaveProperty("cause");
    expect(
      await handlePasswordError(error, "Incorrect password", "Failed"),
    ).toBe("Incorrect password");
  });

  it.each([
    { encrypted: false },
    { permissions: -44 },
    { encryptionKeyLength: 128 },
    { encryptionRevision: 4 },
    { ownerAuthenticated: true },
    { encryptionKeyLength: undefined },
    { credentialFingerprint: "replaced-owner" },
    { credentialFingerprint: undefined },
  ])("rejects a native export with changed protection: %j", async (changed) => {
    const output = new File(["export"], "edited.pdf");
    post.mockResolvedValueOnce({ data: { ...access, ...changed } });
    await expect(verifyEditedPdfProtection(output, access)).rejects.toThrow(
      "Unable to preserve PDF protection",
    );
    expect(getPdfAccess(output)).toBeUndefined();
  });

  it("adopts a verified native export and blocks signed protected edits", async () => {
    const output = new File(["export"], "edited.pdf");
    post.mockResolvedValueOnce({ data: access });
    await verifyEditedPdfProtection(output, access);
    expect(getPdfAccess(output)).toEqual({
      ...access,
      openingPassword: access.password,
    });
    await expect(
      verifyEditedPdfProtection(output, { ...access, signed: true }),
    ).rejects.toThrow("digital signatures");
    expect(post).toHaveBeenCalledOnce();
    expect(() =>
      assertPdfSessionEditable({ encrypted: false, signed: true }),
    ).not.toThrow();
  });

  it("rejects native exports when the source protection cannot be verified", async () => {
    post.mockResolvedValueOnce({ data: access });
    const output = new File(["export"], "edited.pdf");
    await expect(
      verifyEditedPdfProtection(output, {
        ...access,
        encryptionKeyLength: undefined,
      }),
    ).rejects.toThrow("Unable to preserve PDF protection");
    expect(getPdfAccess(output)).toBeUndefined();
  });

  it("isolates same-name files and drops access when a document closes", () => {
    const first = createStirlingFile(new File(["one"], "locked.pdf"));
    const second = createStirlingFile(new File(["two"], "locked.pdf"));
    rememberPdfAccess(first, access);
    expect(getPdfAccess(first.fileId)).toEqual({
      ...access,
      openingPassword: access.password,
    });
    expect(getPdfAccess(second)).toBeUndefined();
    expect(Object.keys(first)).not.toContain("password");
    forgetPdfAccess([first.fileId]);
    expect(getPdfAccess(first)).toBeUndefined();
    expect(getPdfAccess(first.fileId)).toBeUndefined();
  });

  it("uses a temporary decrypted copy without transferring credentials to it", async () => {
    const original = createStirlingFile(new File(["encrypted"], "locked.pdf"));
    rememberPdfAccess(original, access);
    post.mockResolvedValueOnce({ data: new Blob(["decrypted"]) });
    const working = await prepareUnlockedFile(original, rotate);
    expect(working).not.toBe(original);
    expect(working.name).toBe(original.name);
    expect(getPdfAccess(working)).toBeUndefined();
    expect(getPdfAccess(original.fileId)).toEqual({
      ...access,
      openingPassword: access.password,
    });
  });

  it("requires a fresh unlock when different bytes replace an existing file identity", () => {
    const original = createStirlingFile(new File(["old"], "locked.pdf"));
    rememberPdfAccess(original, access);
    const replacement = createStirlingFile(
      new File(["new"], "locked.pdf"),
      original.fileId,
    );
    expect(getPdfAccess(replacement)).toBeUndefined();
    expect(getPdfAccess(original.fileId)).toBeUndefined();
    expect(getPdfAccess(original)).toBeUndefined();
  });

  it.each([
    ["/api/v1/security/auto-redact", access, "cannot yet preserve"],
    [rotate, { ...access, signed: true }, "digital signatures"],
    [
      rotate,
      { ...access, canAssemble: false, permissions: -4 & ~1024 },
      "permissions password",
    ],
  ])(
    "rejects unsupported or restricted processing before decrypting",
    async (endpoint, permission, message) => {
      const original = createStirlingFile(
        new File(["encrypted"], "locked.pdf"),
      );
      rememberPdfAccess(original, permission);
      await expect(prepareUnlockedFile(original, endpoint)).rejects.toThrow(
        message,
      );
      expect(post).not.toHaveBeenCalled();
    },
  );

  it("rejects mixed protected inputs without admitting an output", async () => {
    const first = createStirlingFile(new File(["a"], "first.pdf"));
    const second = createStirlingFile(new File(["b"], "second.pdf"));
    rememberPdfAccess(first, access);
    rememberPdfAccess(second, { ...access, password: "second-password" });
    post.mockResolvedValue({ data: new Blob(["result"]) });
    const merge = "/api/v1/general/merge-pdfs";
    await prepareUnlockedFile(first, merge);
    await prepareUnlockedFile(second, merge);
    await expect(
      protectUnlockedResults(
        [new File(["merged"], "merged.pdf")],
        [first, second],
        merge,
      ),
    ).rejects.toThrow("output protection policy");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("returns no partial output if protection restoration fails", async () => {
    const original = new File(["encrypted"], "locked.pdf");
    rememberPdfAccess(original, access);
    const outputs = [
      new File(["one"], "one.pdf"),
      new File(["two"], "two.pdf"),
    ];
    post
      .mockResolvedValueOnce({ data: new Blob(["protected"]) })
      .mockRejectedValueOnce(new Error("qpdf unavailable"));
    await expect(
      protectUnlockedResults(outputs, [original], rotate),
    ).rejects.toThrow("No unprotected result was saved");
    expect(outputs.every((file) => !getPdfAccess(file))).toBe(true);
  });

  it("leaves explicit Remove Password output unprotected", async () => {
    const original = createStirlingFile(new File(["encrypted"], "locked.pdf"));
    rememberPdfAccess(original, access);
    const endpoint = "/api/v1/security/remove-password";
    const outputs = [new File(["plain"], "plain.pdf")];
    expect(await prepareUnlockedFile(original, endpoint)).toBe(original);
    expect(await protectUnlockedResults(outputs, [original], endpoint)).toBe(
      outputs,
    );
    expect(post).not.toHaveBeenCalled();
  });
});

function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function splitArchive(count: number): Promise<File> {
  const zip = new JSZip();
  for (let page = 1; page <= count; page++) {
    zip.file(`pages/page-${page}.pdf`, `%PDF-1.7\npage ${page}`);
  }
  return new File(
    [await zip.generateAsync({ type: "arraybuffer" })],
    "split.zip",
    {
      type: "application/zip",
    },
  );
}

describe("protected split archives", () => {
  beforeEach(() => {
    vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(
      function (this: Blob) {
        return readBlobBytes(this);
      },
    );
    vi.spyOn(File.prototype, "arrayBuffer").mockImplementation(
      function (this: File) {
        return readBlobBytes(this);
      },
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("preserves ZIP output and protects all ten entries with the source password", async () => {
    const source = new File(["encrypted"], "source.pdf");
    rememberPdfAccess(source, access);
    const archive = await splitArchive(10);
    const outputs = await zipFileService.extractWithPreferences(archive, {
      autoUnzip: true,
      autoUnzipFileLimit: 4,
    });
    expect(outputs).toEqual([archive]);
    post.mockImplementation(async (_url, body) => {
      const entry = (body as FormData).get("fileInput") as File;
      return { data: new Blob([`%PDF-1.7\nprotected ${entry.name}`]) };
    });
    const [protectedZip] = await protectUnlockedResults(
      outputs,
      [source],
      "/api/v1/general/split-by-size-or-count",
    );
    expect(protectedZip.name).toBe("split.zip");
    expect(protectedZip.type).toBe("application/zip");
    const zip = await JSZip.loadAsync(await readBlobBytes(protectedZip));
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    expect(entries).toHaveLength(10);
    for (const entry of entries) {
      expect(await entry.async("string")).toBe(
        `%PDF-1.7\nprotected ${entry.name}`,
      );
    }
    expect(post).toHaveBeenCalledTimes(10);
    for (const [endpoint, body] of post.mock.calls) {
      expect(endpoint).toBe("/api/v1/security/restore-pdf-protection");
      expect((body as FormData).get("sourceFile")).toBe(source);
      expect((body as FormData).get("password")).toBe(access.password);
    }
    expect(getPdfAccess(protectedZip)).toBeUndefined();
  });

  it("returns no ZIP if any entry fails protection", async () => {
    const source = new File(["encrypted"], "source.pdf");
    rememberPdfAccess(source, access);
    post
      .mockResolvedValueOnce({ data: new Blob(["protected"]) })
      .mockRejectedValueOnce(new Error("protection failed"));
    await expect(
      protectUnlockedResults([await splitArchive(10)], [source], rotate),
    ).rejects.toThrow("No unprotected result was saved");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("rejects incomplete ZIP extraction instead of silently losing entries", async () => {
    const source = new File(["encrypted"], "source.pdf");
    rememberPdfAccess(source, access);
    vi.spyOn(zipFileService, "extractAllFiles").mockResolvedValue({
      success: true,
      extractedFiles: [new File(["one"], "one.pdf")],
      errors: ["Unreadable second entry"],
      totalFiles: 2,
      extractedCount: 1,
    });
    await expect(
      protectUnlockedResults([await splitArchive(2)], [source], rotate),
    ).rejects.toThrow("No unprotected result was saved");
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects non-PDF entries instead of returning unprotected content", async () => {
    const source = new File(["encrypted"], "source.pdf");
    rememberPdfAccess(source, access);
    const zip = new JSZip();
    zip.file("content.txt", "unprotected content");
    const output = new File(
      [await zip.generateAsync({ type: "arraybuffer" })],
      "result.zip",
      { type: "application/zip" },
    );
    await expect(
      protectUnlockedResults([output], [source], rotate),
    ).rejects.toThrow("No unprotected result was saved");
    expect(post).not.toHaveBeenCalled();
  });
});
