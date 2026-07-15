import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import type { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import type { BaseParametersHook } from "@app/hooks/tools/shared/useBaseParameters";
import type { StirlingFile } from "@app/types/fileContext";

// Isolate useBaseTool from the file/viewer/endpoint contexts so the test can
// focus on the unmount lifecycle wiring.
const scopedFiles: { current: StirlingFile[] } = { current: [] };
vi.mock("@app/hooks/tools/shared/useViewScopedFiles", () => ({
  useViewScopedFiles: () => scopedFiles.current,
}));
vi.mock("@app/hooks/useEndpointConfig", () => ({
  useEndpointEnabled: () => ({ enabled: true, loading: false }),
}));

const cancelOperation = vi.fn();

const makeOperation = (isLoading: boolean): ToolOperationHook<unknown> =>
  ({
    files: [],
    thumbnails: [],
    isGeneratingThumbnails: false,
    downloadUrl: null,
    downloadFilename: null,
    downloadLocalPath: null,
    outputFileIds: [],
    isLoading,
    status: "",
    errorMessage: null,
    progress: null,
    willUseCloud: false,
    executeOperation: vi.fn(),
    resetResults: vi.fn(),
    clearError: vi.fn(),
    cancelOperation,
    undoOperation: vi.fn(),
  }) as unknown as ToolOperationHook<unknown>;

const makeParams = (): BaseParametersHook<unknown> =>
  ({
    parameters: {},
    updateParameter: vi.fn(),
    setParameters: vi.fn(),
    resetParameters: vi.fn(),
    validateParameters: () => true,
    getEndpointName: () => "compress-pdf",
  }) as unknown as BaseParametersHook<unknown>;

const props = {
  onPreviewFile: vi.fn(),
  onComplete: vi.fn(),
  onError: vi.fn(),
};

describe("useBaseTool unmount behaviour", () => {
  beforeEach(() => {
    cancelOperation.mockClear();
    scopedFiles.current = [];
  });

  test("aborts the in-flight operation when the tool unmounts mid-run", () => {
    const { unmount } = renderHook(() =>
      useBaseTool("compress", makeParams, () => makeOperation(true), props),
    );

    expect(cancelOperation).not.toHaveBeenCalled();
    unmount();
    expect(cancelOperation).toHaveBeenCalledTimes(1);
  });

  test("does not cancel on unmount when no operation is running", () => {
    const { unmount } = renderHook(() =>
      useBaseTool("compress", makeParams, () => makeOperation(false), props),
    );

    unmount();
    expect(cancelOperation).not.toHaveBeenCalled();
  });
});
