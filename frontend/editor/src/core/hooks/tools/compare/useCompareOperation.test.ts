import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCompareOperation } from "@app/hooks/tools/compare/useCompareOperation";
import { defaultParameters } from "@app/hooks/tools/compare/useCompareParameters";
import { createTestStirlingFile } from "@app/tests/utils/testFileHelpers";

const mocks = vi.hoisted(() => ({
  blocked: new Set<string>(),
  runPixelCompare: vi.fn(),
  revokePixelResult: vi.fn(),
  extractContentFromPdf: vi.fn(),
  worker: vi.fn(),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileContext: () => ({ selectors: { getFile: vi.fn() } }),
}));
vi.mock("@app/services/policyBlockRegistry", () => ({
  isFileBlocked: (id: string) => mocks.blocked.has(id),
}));
vi.mock("@app/services/pixelCompareService", () => ({
  runPixelCompare: (...args: unknown[]) => mocks.runPixelCompare(...args),
  revokePixelResult: (...args: unknown[]) => mocks.revokePixelResult(...args),
}));
vi.mock("@app/hooks/tools/compare/operationUtils", () => ({
  extractContentFromPdf: (...args: unknown[]) =>
    mocks.extractContentFromPdf(...args),
  getWorkerErrorCode: () => undefined,
}));
vi.mock("@app/workers/compareWorker?worker", () => ({ default: mocks.worker }));
vi.mock("@app/components/toast", () => ({
  alert: vi.fn(),
  dismissToast: vi.fn(),
}));

const files = [
  createTestStirlingFile("base.pdf"),
  createTestStirlingFile("comparison.pdf"),
];
const params = {
  ...defaultParameters,
  baseFileId: files[0].fileId,
  comparisonFileId: files[1].fileId,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.blocked.clear();
});

describe("Compare policy guards", () => {
  it.each(["text", "pixel"] as const)(
    "rejects blocked inputs before %s processing",
    async (mode) => {
      mocks.blocked.add(files[1].fileId);
      const { result } = renderHook(useCompareOperation);
      await act(() =>
        result.current.executeOperation({ ...params, mode }, files),
      );
      expect(result.current.errorMessage).toBe("policy.blockedBody");
      expect(mocks.extractContentFromPdf).not.toHaveBeenCalled();
      expect(mocks.runPixelCompare).not.toHaveBeenCalled();
      expect(mocks.worker).not.toHaveBeenCalled();
    },
  );

  it("does not send extracted text to the worker after a policy fails", async () => {
    mocks.extractContentFromPdf.mockImplementation(async () => {
      mocks.blocked.add(files[0].fileId);
      return {};
    });
    const { result } = renderHook(useCompareOperation);
    await act(() =>
      result.current.executeOperation({ ...params, mode: "text" }, files),
    );
    expect(mocks.worker).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("releases pixel results that finish after a policy failure and permits a fresh run after recovery", async () => {
    const pixelResult = { mode: "pixel", warnings: [] };
    mocks.runPixelCompare.mockImplementationOnce(async () => {
      mocks.blocked.add(files[0].fileId);
      return pixelResult;
    });
    const { result } = renderHook(useCompareOperation);
    await act(() =>
      result.current.executeOperation({ ...params, mode: "pixel" }, files),
    );
    expect(mocks.revokePixelResult).toHaveBeenCalledWith(pixelResult);
    expect(result.current.result).toBeNull();
    mocks.blocked.clear();
    mocks.runPixelCompare.mockResolvedValue(pixelResult);
    await act(() =>
      result.current.executeOperation({ ...params, mode: "pixel" }, files),
    );
    expect(result.current.result).toBe(pixelResult);
  });
});
