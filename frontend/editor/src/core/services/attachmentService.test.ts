import { beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

const post = vi.fn();
const isAxiosErrorMock = vi.fn();

vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock("axios", () => ({
  default: { isAxiosError: (...args: unknown[]) => isAxiosErrorMock(...args) },
}));

const {
  listAttachments,
  renameAttachment,
  deleteAttachment,
  extractSingleAttachment,
  addAttachments,
  applyBatchAttachmentOps,
  parseBlobError,
} = await import("@app/services/attachmentService");

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
  });

  it("lists attachments from the server", async () => {
    const attachments = [{ filename: "a.txt", size: 4 }];
    post.mockResolvedValue({ data: attachments });
    const result = await listAttachments(pdfFile());
    expect(result).toEqual(attachments);
    expect(post).toHaveBeenCalledWith("/api/v1/misc/list-attachments", expect.any(FormData));
  });

  it("renames an attachment and returns a blob", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await renameAttachment(pdfFile(), "old.txt", "new.txt");
    expect(result).toBeInstanceOf(Blob);
    expect(post).toHaveBeenCalledWith("/api/v1/misc/rename-attachment", expect.any(FormData), { responseType: "blob" });
  });

  it("deletes an attachment and returns a blob", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await deleteAttachment(pdfFile(), "old.txt");
    expect(result).toBeInstanceOf(Blob);
    expect(post).toHaveBeenCalledWith("/api/v1/misc/delete-attachment", expect.any(FormData), { responseType: "blob" });
  });

  it("extracts a single attachment directly", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await extractSingleAttachment(pdfFile(), "a.txt");
    expect(result).toBeInstanceOf(Blob);
    expect(post).toHaveBeenCalledWith("/api/v1/misc/extract-single-attachment", expect.any(FormData), {
      responseType: "blob",
    });
  });

  it("adds attachments and returns a blob", async () => {
    post.mockResolvedValue(blobResponse());
    const result = await addAttachments(pdfFile(), [pdfFile("x.txt")], true);
    expect(result).toBeInstanceOf(Blob);
    const formData = post.mock.calls[0][1] as FormData;
    expect(formData.get("convertToPdfA3b")).toBe("true");
    expect(post).toHaveBeenCalledWith("/api/v1/misc/add-attachments", expect.any(FormData), { responseType: "blob" });
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
    expect(post).toHaveBeenCalledWith("/api/v1/misc/batch-process-attachments", expect.any(FormData), {
      responseType: "blob",
    });
  });

  it("extracts a single attachment through the legacy ZIP fallback on 404", async () => {
    isAxiosErrorMock.mockReturnValue(true);
    const zip = new JSZip();
    zip.file("a.txt", "hello");
    const zipBlob = await zip.generateAsync({ type: "blob" });
    post.mockRejectedValueOnce({ response: { status: 404 } }).mockResolvedValueOnce({ data: zipBlob });

    const result = await extractSingleAttachment(pdfFile(), "a.txt");
    expect(result).toBeInstanceOf(Blob);
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/misc/extract-single-attachment",
      "/api/v1/misc/extract-attachments",
    ]);
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
