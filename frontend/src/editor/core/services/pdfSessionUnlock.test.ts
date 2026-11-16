import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import axios from "axios";
import JSZip from "jszip";
import { zipFileService } from "@editor/services/zipFileService";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  clearPdfAccess,
  forgetPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import {
  hasPdfPermissionOverride,
  pdfAllows,
} from "@editor/services/pdfPermissions";
import {
  prepareUnlockedFile,
  protectUnlockedResults,
  assertPdfSessionEditable,
  preflightPdfOperation,
  changePdfSecurity,
} from "@editor/services/pdfSessionUnlock";
import { PdfPermissionFlag } from "@embedpdf/models";

vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));
const post = vi.mocked(apiClient.post);
const access: PdfAccess = {
  password: " password\n",
  encrypted: true,
  signed: false,
  ownerAuthenticated: false,
  permissions: -4,
  encryptionRevision: 6,
  pageCount: 2,
};
const rotate = "/api/v1/general/rotate-pdf";

beforeEach(() => {
  clearPdfAccess();
  post.mockReset();
});
afterEach(clearPdfAccess);

describe("session PDF access", () => {
  it.each([false, true])(
    "authenticates known encrypted input before changing protection, cancelled: %s",
    async (cancelled) => {
      const file = createStirlingFile(new File(["encrypted"], "locked.pdf"));
      const requestOwner = vi.fn(async () => {
        if (cancelled) return false;
        rememberPdfAccess(file, {
          ...access,
          password: "source-owner",
          ownerAuthenticated: true,
        });
        return true;
      });
      const endpoint = "/api/v1/security/add-password";
      const permitted = await preflightPdfOperation(
        [file],
        endpoint,
        false,
        requestOwner,
        undefined,
        () => true,
      );
      expect(requestOwner).toHaveBeenCalledExactlyOnceWith(file);
      expect(permitted).toBe(!cancelled);
      expect(post).not.toHaveBeenCalled();
      if (permitted) {
        const form = new FormData();
        form.set("keyLength", "256");
        form.set("password", "new-reader");
        post.mockResolvedValueOnce({ data: new Blob(["result"]) });
        await changePdfSecurity(file, form, endpoint);
        expect(form.get("sourcePassword")).toBe("source-owner");
        expect(form.get("password")).toBe("new-reader");
      }
    },
  );

  it.each([
    ["add-password", false],
    ["add-password", true],
    ["remove-password", false],
  ])(
    "lets %s validate unknown protection with preserveExisting=%s",
    async (operation, preserveExisting) => {
      const file = createStirlingFile(new File(["pdf"], "unknown.pdf"));
      const endpoint = `/api/v1/security/${operation}`;
      const requestOwner = vi.fn();
      expect(
        await preflightPdfOperation(
          [file],
          endpoint,
          false,
          requestOwner,
          undefined,
          () => operation === "remove-password",
        ),
      ).toBe(true);
      expect(requestOwner).not.toHaveBeenCalled();
      expect(post).not.toHaveBeenCalled();
      const form = new FormData();
      form.set("password", "reader");
      if (!preserveExisting) form.set("keyLength", "256");
      post.mockResolvedValueOnce({ data: new Blob(["result"]) });
      await changePdfSecurity(file, form, endpoint);
      expect(post).toHaveBeenCalledOnce();
      expect(post.mock.calls[0][0]).toBe(endpoint);
      expect(form.get("preserveExisting")).toBe(
        preserveExisting ? "true" : null,
      );
      expect(form.get("sourcePassword")).toBe(
        operation === "remove-password" ? "reader" : "",
      );
    },
  );

  it("submits both removal selections with incomplete local role information", async () => {
    const file = createStirlingFile(new File(["pdf"], "protected.pdf"));
    rememberPdfAccess(file, { ...access });
    const requestOwner = vi.fn();
    expect(
      await preflightPdfOperation(
        [file],
        "/api/v1/security/remove-password",
        false,
        requestOwner,
      ),
    ).toBe(true);
    const form = new FormData();
    form.set("password", "reader");
    form.set("ownerPassword", "owner");
    post.mockResolvedValueOnce({ data: new Blob(["result"]) });
    await changePdfSecurity(file, form, "/api/v1/security/remove-password");
    expect(requestOwner).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledOnce();
    expect(form.get("password")).toBe("reader");
    expect(form.get("ownerPassword")).toBe("owner");
  });

  it("retains policy and known opening credentials when local facts refresh", () => {
    const file = new File(["source"], "protected.pdf");
    rememberPdfAccess(file, {
      ...access,
      honorOwnerPasswords: false,
      requiresOpeningPassword: true,
    });
    const refreshed = rememberPdfAccess(file, {
      ...access,
      requiresOpeningPassword: undefined,
    });
    expect(refreshed).toMatchObject({
      honorOwnerPasswords: false,
      requiresOpeningPassword: true,
      openingPassword: access.password,
    });
    expect(post).not.toHaveBeenCalled();
  });

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
    expect(post.mock.calls[0][0]).toBe("/api/v1/security/remove-password");
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
    expect(post.mock.calls[0][0]).toBe("/api/v1/security/add-password");
    expect(form.get("sourcePassword")).toBe(access.password);
    expect(form.get("preserveExisting")).toBe("true");
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
    expect(post.mock.calls[0][0]).toBe("/api/v1/security/remove-password");
  });
  it("blocks signed protected edits", () => {
    expect(() => assertPdfSessionEditable({ ...access, signed: true })).toThrow(
      "digital signatures",
    );
    expect(() =>
      assertPdfSessionEditable({ ...access, encrypted: false, signed: true }),
    ).not.toThrow();
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
    const navigation = new AbortController();
    navigation.abort();
    const cancellation = axios.CancelToken.source();
    const working = await prepareUnlockedFile(
      original,
      rotate,
      navigation.signal,
      cancellation.token,
    );
    expect(post.mock.calls[0][2]?.signal?.aborted).toBe(false);
    expect(post.mock.calls[0][2]?.cancelToken).toBe(cancellation.token);
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
    [rotate, { ...access, permissions: -4 & ~1024 }, "permissions password"],
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
