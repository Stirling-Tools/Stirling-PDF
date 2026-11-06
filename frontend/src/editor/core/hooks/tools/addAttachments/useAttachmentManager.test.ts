import { describe, expect, test, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAttachmentManager } from "@editor/hooks/tools/addAttachments/useAttachmentManager";
import { applyBatchAttachmentOps } from "@editor/services/attachmentService";

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

  test("places a pin and sends it with the batch save", async () => {
    listAttachments.mockResolvedValue([
      {
        filename: "existing.pdf",
        size: 12,
        contentType: "application/pdf",
        pinPageIndex: 0,
        pinX: 0.2,
        pinY: 0.8,
      },
    ]);
    vi.mocked(applyBatchAttachmentOps).mockResolvedValue(new Blob(["pdf"]));

    const activeFile = pdfFile("document.pdf");
    const { result } = renderHook(() => useAttachmentManager({ activeFile }));

    await waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });
    expect(result.current.rows[0].pin).toEqual({
      pageIndex: 0,
      x: 0.2,
      y: 0.8,
    });

    act(() => {
      result.current.startPinPlacement(result.current.rows[0].id);
    });
    act(() => {
      result.current.placePin(1, 0.4, 0.6);
    });

    expect(result.current.rows[0].pin).toEqual({
      pageIndex: 1,
      x: 0.4,
      y: 0.6,
    });
    expect(result.current.hasChanges).toBe(true);

    await act(async () => {
      await result.current.saveDraft();
    });

    expect(applyBatchAttachmentOps).toHaveBeenCalledWith(
      activeFile,
      expect.objectContaining({
        pins: [
          {
            filename: "existing.pdf",
            pageIndex: 1,
            x: 0.4,
            y: 0.6,
          },
        ],
        pinRemovals: [],
      }),
    );
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
