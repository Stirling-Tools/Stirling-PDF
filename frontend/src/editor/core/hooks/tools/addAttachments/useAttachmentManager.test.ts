import { describe, expect, test, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAttachmentManager } from "@editor/hooks/tools/addAttachments/useAttachmentManager";
import { applyBatchAttachmentOps } from "@editor/services/attachmentService";
import {
  clearPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const listAttachments = vi.fn();
vi.mock("@editor/services/attachmentService", () => ({
  listAttachments: (...args: unknown[]) => listAttachments(...args),
  applyBatchAttachmentOps: vi.fn(),
  extractAttachments: vi.fn(),
  extractSingleAttachment: vi.fn(),
  parseBlobError: vi.fn(async (err: unknown) =>
    err instanceof Error ? err.message : "failed",
  ),
}));

vi.mock("@editor/services/exportWithPolicy", () => ({
  downloadFileWithPolicy: vi.fn(),
}));

const session = vi.hoisted(() => ({
  preflightPdfOperation: vi.fn(async () => true),
  prepareUnlockedFile: vi.fn(async (file: File) => file),
  protectUnlockedResults: vi.fn(async (outputs: File[]) => outputs),
}));
vi.mock("@editor/services/pdfSessionUnlock", () => session);

const requestPdfOwnerAccess = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileActions: () => ({ actions: { requestPdfOwnerAccess } }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function pdfFile(name: string, bytes = 64): File {
  return new File([new Uint8Array(bytes)], name, {
    type: "application/pdf",
  });
}

afterEach(() => {
  vi.clearAllMocks();
  clearPdfAccess();
});

function passwordProtected(file: File): File {
  rememberPdfAccess(file, {
    password: "secret",
    encrypted: true,
    signed: false,
    ownerAuthenticated: false,
    permissions: -4,
    pageCount: 1,
  });
  return file;
}

describe("useAttachmentManager", () => {
  test("keeps a file staged while the initial list request is in flight", async () => {
    const pending =
      deferred<
        Array<{ filename: string; size: number; contentType: string }>
      >();
    listAttachments.mockReturnValue(pending.promise);

    const activeFile = pdfFile("document.pdf");
    const { result } = renderHook(() => useAttachmentManager({ activeFile }));

    await act(async () => {
      result.current.stageFiles([pdfFile("evidence.pdf")]);
    });

    await act(async () => {
      pending.resolve([
        { filename: "existing.pdf", size: 12, contentType: "application/pdf" },
      ]);
      await pending.promise;
    });

    await waitFor(() => {
      expect(result.current.rows.map((row) => row.name)).toEqual([
        "existing.pdf",
        "evidence.pdf",
      ]);
    });
    expect(result.current.rows[1]).toMatchObject({
      kind: "staged",
      name: "evidence.pdf",
    });
    expect(result.current.hasChanges).toBe(true);
  });

  test("drops rows staged for the previous file when the next list lands", async () => {
    const first =
      deferred<
        Array<{ filename: string; size: number; contentType: string }>
      >();
    const second =
      deferred<
        Array<{ filename: string; size: number; contentType: string }>
      >();
    listAttachments.mockReturnValueOnce(first.promise);
    listAttachments.mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ file }: { file: File }) => useAttachmentManager({ activeFile: file }),
      { initialProps: { file: pdfFile("first.pdf") } },
    );

    await act(async () => {
      first.resolve([]);
      await first.promise;
    });
    await act(async () => {
      result.current.stageFiles([pdfFile("staged-for-first.pdf")]);
    });
    expect(result.current.rows.map((row) => row.name)).toEqual([
      "staged-for-first.pdf",
    ]);

    rerender({ file: pdfFile("second.pdf") });
    await act(async () => {
      second.resolve([
        { filename: "existing.pdf", size: 12, contentType: "application/pdf" },
      ]);
      await second.promise;
    });

    await waitFor(() => {
      expect(result.current.rows.map((row) => row.name)).toEqual([
        "existing.pdf",
      ]);
    });
    expect(result.current.hasChanges).toBe(false);
  });

  test("edits a password-protected PDF through its unlocked copy and keeps the password", async () => {
    const locked = passwordProtected(pdfFile("locked.pdf"));
    const unlocked = pdfFile("locked.pdf", 32);
    const relocked = pdfFile("locked.pdf", 96);
    session.prepareUnlockedFile.mockResolvedValue(unlocked);
    session.protectUnlockedResults.mockResolvedValue([relocked]);
    vi.mocked(applyBatchAttachmentOps).mockResolvedValue(new Blob(["edited"]));
    listAttachments.mockResolvedValue([]);
    const onFileUpdated = vi.fn();

    const { result } = renderHook(() =>
      useAttachmentManager({ activeFile: locked, onFileUpdated }),
    );
    await waitFor(() => expect(listAttachments).toHaveBeenCalledWith(unlocked));

    await act(async () => {
      result.current.stageFiles([pdfFile("notes.pdf")]);
    });
    await act(async () => {
      expect(await result.current.saveDraft()).toBe(true);
    });

    expect(applyBatchAttachmentOps).toHaveBeenCalledWith(
      unlocked,
      expect.anything(),
    );
    expect(session.protectUnlockedResults).toHaveBeenCalledWith(
      [expect.any(File)],
      [locked],
      "/api/v1/misc/batch-process-attachments",
    );
    expect(onFileUpdated).toHaveBeenCalledWith(relocked);
  });

  test("asks for the password to be removed before converting a protected PDF to PDF/A-3b", async () => {
    const locked = passwordProtected(pdfFile("locked.pdf"));
    listAttachments.mockResolvedValue([]);
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAttachmentManager({ activeFile: locked, onError }),
    );
    await act(async () => {
      result.current.stageFiles([pdfFile("notes.pdf")]);
    });
    await act(async () => {
      expect(await result.current.saveDraft(true)).toBe(false);
    });

    expect(applyBatchAttachmentOps).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining("Remove the password first"),
    );
  });

  test("saves nothing when the permissions password is not given", async () => {
    session.preflightPdfOperation.mockResolvedValueOnce(false);
    const locked = passwordProtected(
      Object.assign(pdfFile("locked.pdf"), { fileId: "f1", quickKey: "k" }),
    );
    listAttachments.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useAttachmentManager({ activeFile: locked }),
    );
    await act(async () => {
      result.current.stageFiles([pdfFile("notes.pdf")]);
    });
    await act(async () => {
      expect(await result.current.saveDraft()).toBe(false);
    });

    expect(applyBatchAttachmentOps).not.toHaveBeenCalled();
  });
});
