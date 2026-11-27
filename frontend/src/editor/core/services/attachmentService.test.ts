import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const isAxiosErrorMock = vi.fn();
const readPdfAttachments = vi.fn();
const readPdfAttachmentBytes = vi.fn();
const readPdfAttachmentsWithContent = vi.fn();
const zipFile = vi.fn();
const zipGenerateAsync = vi.fn(async () => new Blob());

vi.mock("@editor/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock("@editor/services/pdfiumService", () => ({
  readPdfAttachments: (...args: unknown[]) => readPdfAttachments(...args),
  readPdfAttachmentBytes: (...args: unknown[]) =>
    readPdfAttachmentBytes(...args),
  readPdfAttachmentsWithContent: (...args: unknown[]) =>
    readPdfAttachmentsWithContent(...args),
}));

vi.mock("jszip", () => ({
  default: class {
    file(...args: unknown[]) {
      zipFile(...args);
    }
    generateAsync(..._args: unknown[]) {
      return zipGenerateAsync();
    }
  },
}));

vi.mock("axios", () => ({
  default: { isAxiosError: (...args: unknown[]) => isAxiosErrorMock(...args) },
}));

const {
  listAttachments,
  renameAttachment,
  deleteAttachment,
  extractAttachments,
  extractSingleAttachment,
  addAttachments,
  applyBatchAttachmentOps,
  parseBlobError,
} = await import("@editor/services/attachmentService");

function pdfFile(name = "doc.pdf"): File {
  return new File([new Uint8Array([37, 80, 68, 70])], name, {
    type: "application/pdf",
  });
}

function blobResponse(): { data: Blob } {
  return {
    data: new Blob([], { type: "application/pdf" }),
  };
}

describe("attachmentService CRUD", () => {
  beforeEach(() => {
    post.mockReset();
    isAxiosErrorMock.mockReset();
    readPdfAttachments.mockReset();
    readPdfAttachmentBytes.mockReset();
    readPdfAttachmentsWithContent.mockReset();
    zipFile.mockClear();
    zipGenerateAsync.mockClear();
  });

  it("lists attachments locally without uploading the PDF", async () => {
    readPdfAttachments.mockResolvedValue([
      {
        index: 0,
        name: "a.txt",
        description: "",
        mimeType: "text/plain",
        size: 4,
      },
    ]);

    const result = await listAttachments(pdfFile());

    expect(result).toEqual([
      {
        filename: "a.txt",
        size: 4,
        contentType: "text/plain",
        description: undefined,
        creationDate: undefined,
      },
    ]);
    expect(post).not.toHaveBeenCalled();
  });

  it("renames an attachment and returns a blob", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await renameAttachment(pdfFile(), "old.txt", "new.txt");
    expect(result).toBeInstanceOf(Blob);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/misc/rename-attachment",
      expect.any(FormData),
      { responseType: "blob" },
    );
  });

  it("deletes an attachment and returns a blob", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await deleteAttachment(pdfFile(), "old.txt");
    expect(result).toBeInstanceOf(Blob);
    expect(post).toHaveBeenCalledWith(
      "/api/v1/misc/delete-attachment",
      expect.any(FormData),
      { responseType: "blob" },
    );
  });

  it("extracts a single attachment locally", async () => {
    readPdfAttachments.mockResolvedValue([
      {
        index: 3,
        name: "a.txt",
        description: "",
        mimeType: "text/plain",
        size: 5,
      },
    ]);
    readPdfAttachmentBytes.mockResolvedValue(
      new TextEncoder().encode("hello").buffer,
    );

    const result = await extractSingleAttachment(pdfFile(), "a.txt");

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("text/plain");
    expect(readPdfAttachmentBytes).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      3,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it("zips every attachment locally with unique leaf names", async () => {
    readPdfAttachmentsWithContent.mockResolvedValue([
      {
        attachment: {
          index: 0,
          name: "reports/../a.txt",
          description: "",
          mimeType: "text/plain",
          size: 5,
        },
        bytes: new TextEncoder().encode("hello").buffer,
      },
      {
        attachment: {
          index: 1,
          name: "a.txt",
          description: "",
          mimeType: "text/plain",
          size: 5,
        },
        bytes: new TextEncoder().encode("hello").buffer,
      },
      {
        attachment: {
          index: 2,
          name: "",
          description: "",
          mimeType: "text/plain",
          size: 5,
        },
        bytes: new TextEncoder().encode("hello").buffer,
      },
    ]);

    const result = await extractAttachments(pdfFile());

    expect(result).toBeInstanceOf(Blob);
    expect(readPdfAttachmentsWithContent).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
    );
    expect(zipFile.mock.calls.map(([name]) => name)).toEqual([
      "a.txt",
      "a_1.txt",
      "attachment",
    ]);
    expect(post).not.toHaveBeenCalled();
  });

  it("adds attachments and returns a blob", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await addAttachments(pdfFile(), [pdfFile("x.txt")], true);
    expect(result).toBeInstanceOf(Blob);
    const formData = post.mock.calls[0][1] as FormData;
    expect(formData.get("convertToPdfA3b")).toBe("true");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/misc/add-attachments",
      expect.any(FormData),
      { responseType: "blob" },
    );
  });

  it("applies batch operations via the batch endpoint", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await applyBatchAttachmentOps(pdfFile(), {
      renames: [{ oldName: "a", newName: "b" }],
      deletions: ["c"],
      additions: [pdfFile("d.txt")],
    });
    expect(result).toBeInstanceOf(Blob);
    const formData = post.mock.calls[0][1] as FormData;
    expect(JSON.parse(formData.get("opsJson") as string)).toEqual({
      renames: [{ oldName: "a", newName: "b" }],
      deletions: ["c"],
    });
    expect(post).toHaveBeenCalledWith(
      "/api/v1/misc/batch-process-attachments",
      expect.any(FormData),
      {
        responseType: "blob",
      },
    );
  });

  it("reports a missing local attachment", async () => {
    readPdfAttachments.mockResolvedValue([]);

    await expect(
      extractSingleAttachment(pdfFile(), "missing.txt"),
    ).rejects.toThrow("not found");
    expect(readPdfAttachmentBytes).not.toHaveBeenCalled();
  });

  it("falls back to sequential rename/delete when batch is unsupported", async () => {
    isAxiosErrorMock.mockReturnValue(true);
    post
      .mockRejectedValueOnce({ response: { status: 501 } })
      .mockResolvedValueOnce(blobResponse()) // rename
      .mockResolvedValueOnce(blobResponse()) // delete
      .mockResolvedValueOnce(blobResponse()); // add

    const result = await applyBatchAttachmentOps(pdfFile(), {
      renames: [{ oldName: "a", newName: "b" }],
      deletions: ["c"],
      additions: [pdfFile("d.txt")],
    });
    expect(result).toBeInstanceOf(Blob);
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/misc/batch-process-attachments",
      "/api/v1/misc/rename-attachment",
      "/api/v1/misc/delete-attachment",
      "/api/v1/misc/add-attachments",
    ]);
  });

  it("extracts a readable message from a blob error body", async () => {
    isAxiosErrorMock.mockReturnValue(true);
    const err = {
      isAxiosError: true,
      response: {
        data: { message: "boom" },
      },
    };
    const msg = await parseBlobError(err, "fallback");
    expect(msg).toBe("boom");
  });
});
