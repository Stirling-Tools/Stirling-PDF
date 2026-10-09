import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useToolOperation,
  ToolType,
  type CustomToolOperationConfig,
} from "@app/hooks/tools/shared/useToolOperation";

const { consumeFiles, setWorkbench } = vi.hoisted(() => ({
  consumeFiles: vi.fn().mockResolvedValue(["output-id"]),
  setWorkbench: vi.fn(),
}));
vi.mock("@app/contexts/FileContext", () => ({
  useFileContext: () => ({
    consumeFiles,
    selectors: { getStirlingFileStub: vi.fn() },
    actions: {},
  }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({ actions: { setWorkbench } }),
}));
vi.mock("@app/contexts/ViewerContext", async () => ({
  ViewerContext: (await import("react")).createContext(null),
}));
vi.mock("@app/hooks/tools/shared/useToolApiCalls", () => ({
  useToolApiCalls: () => ({ processFiles: vi.fn(), cancelOperation: vi.fn() }),
}));
vi.mock("@app/hooks/tools/shared/useToolResources", () => ({
  useToolResources: () => ({
    generateThumbnails: vi.fn().mockResolvedValue([""]),
    createDownloadInfo: vi
      .fn()
      .mockResolvedValue({ url: "blob:result", filename: "website.pdf" }),
    cleanupBlobUrls: vi.fn(),
    extractZipFiles: vi.fn(),
  }),
}));
vi.mock("@app/contexts/file/fileActions", () => ({
  generateProcessedFileMetadata: vi.fn().mockResolvedValue({ pages: [] }),
}));
vi.mock("@app/services/backendReadinessGuard", () => ({
  ensureBackendReady: vi.fn().mockResolvedValue(true),
}));
vi.mock("@app/hooks/useCreditCheck", () => ({
  useCreditCheck: () => ({ checkCredits: vi.fn().mockResolvedValue(null) }),
}));
vi.mock("@app/hooks/useWillUseCloud", () => ({ useWillUseCloud: () => false }));
vi.mock("@app/services/desktopNotificationService", () => ({
  notifyPdfProcessingComplete: vi.fn(),
}));
vi.mock("@app/services/apiClient", () => ({ default: {} }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe("operations without uploaded files", () => {
  it("imports a generated PDF through FileContext without consuming existing files", async () => {
    const pdf = new File(["%PDF-1.7"], "website.pdf", {
      type: "application/pdf",
    });
    const config: CustomToolOperationConfig<void> = {
      operationType: "urlToPdf",
      toolType: ToolType.custom,
      requiresFiles: false,
      customProcessor: vi.fn().mockResolvedValue({ files: [pdf] }),
    };
    const { result } = renderHook(() => useToolOperation(config));
    await act(() => result.current.executeOperation(undefined, []));
    expect(config.customProcessor).toHaveBeenCalledWith(undefined, []);
    expect(result.current.errorMessage).toBeNull();
    expect(consumeFiles).toHaveBeenCalledWith(
      [],
      [expect.objectContaining({ name: "website.pdf" })],
      [expect.objectContaining({ name: "website.pdf" })],
    );
    expect(result.current.downloadUrl).toBe("blob:result");
    expect(setWorkbench).toHaveBeenCalledWith("viewer");
  });
  it("still requires input files for ordinary tools", async () => {
    const config: CustomToolOperationConfig<void> = {
      operationType: "convert",
      toolType: ToolType.custom,
      customProcessor: vi.fn(),
    };
    const { result } = renderHook(() => useToolOperation(config));
    await act(() => result.current.executeOperation(undefined, []));
    expect(config.customProcessor).not.toHaveBeenCalled();
    expect(result.current.errorMessage).toBe("No file loaded");
  });
});
