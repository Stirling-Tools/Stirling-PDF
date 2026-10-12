import { describe, expect, test, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAttachmentManager } from "@app/hooks/tools/addAttachments/useAttachmentManager";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const listAttachments = vi.fn();
vi.mock("@app/services/attachmentService", () => ({
  listAttachments: (...args: unknown[]) => listAttachments(...args),
  applyBatchAttachmentOps: vi.fn(),
  extractAttachments: vi.fn(),
  extractSingleAttachment: vi.fn(),
  parseBlobError: vi.fn(async (err: unknown) =>
    err instanceof Error ? err.message : "failed",
  ),
}));

vi.mock("@app/services/exportWithPolicy", () => ({
  downloadFileWithPolicy: vi.fn(),
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
});

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
});
