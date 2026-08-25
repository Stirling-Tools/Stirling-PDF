import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("@app/services/formDetection/progress", () => ({
  emitStage: vi.fn(),
  emitSummary: vi.fn(),
  summarizeFields: vi.fn(() => ({})),
}));
vi.mock("@app/services/formDetection/applyFields", () => ({
  applyFields: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("@app/services/formDetection/runBrowserPipeline", () => ({
  runBrowserDetection: vi.fn(async () => ({
    fields: [],
    appliedPdf: new Uint8Array([1, 2, 3]),
  })),
}));
vi.mock("@app/hooks/useFormDetectionModelStatus", () => ({}));
vi.mock("@app/hooks/tools/shared/useToolOperation", () => ({
  ToolType: { custom: "custom" },
  useToolOperation: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import apiClient from "@app/services/apiClient";
import { runBrowserDetection } from "@app/services/formDetection/runBrowserPipeline";
import {
  autoFormDetectionOperationConfig,
  NO_LOCAL_MODEL_ERROR,
} from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionOperation";
import { defaultParameters } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";

const CATALOG_ENTRY = {
  id: "ffdnet-s",
  displayName: "FFDNet-S",
  description: "",
  license: "",
  sizeBytes: 1,
  onnxUrl: "",
  sha256: "",
  inputSize: 1216,
};

function stubStatus(overrides: Record<string, unknown>) {
  (apiClient.get as Mock).mockResolvedValue({
    data: {
      status: "ready",
      catalog: [CATALOG_ENTRY],
      activeModelId: "ffdnet-s",
      executionMode: "auto",
      ...overrides,
    },
  });
}

function pdfFile(): File {
  return new File(["%PDF-1.4 dummy"], "doc.pdf", { type: "application/pdf" });
}

const process = autoFormDetectionOperationConfig.customProcessor;

// The admin UI promises browser mode keeps PDFs on the device, so a missing model
// must be an error, never a silent upload (Ethan's review, PR #6663).
describe("processAutoFormDetection engine selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.post as Mock).mockResolvedValue({ data: { detections: [] } });
  });

  it("browser mode without an active model fails instead of uploading", async () => {
    stubStatus({ executionMode: "browser", activeModelId: "" });

    await expect(process(defaultParameters, [pdfFile()])).rejects.toThrow(
      NO_LOCAL_MODEL_ERROR,
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("browser mode with an active model never posts the file", async () => {
    stubStatus({ executionMode: "browser" });

    await process(defaultParameters, [pdfFile()]);

    expect(runBrowserDetection).toHaveBeenCalledTimes(1);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("server mode uploads to the detect endpoint", async () => {
    stubStatus({ executionMode: "server" });

    await process(defaultParameters, [pdfFile()]);

    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/v1/form/form-detection/detect",
      expect.any(FormData),
    );
  });

  it("auto mode without an active model may fall back to the server", async () => {
    stubStatus({ executionMode: "auto", activeModelId: "" });

    await process(defaultParameters, [pdfFile()]);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(runBrowserDetection).not.toHaveBeenCalled();
  });
});
