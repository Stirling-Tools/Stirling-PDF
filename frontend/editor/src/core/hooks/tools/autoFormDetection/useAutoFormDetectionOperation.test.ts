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

import { expectConsole } from "@app/tests/failOnConsole";
import apiClient from "@app/services/apiClient";
import { applyFields } from "@app/services/formDetection/applyFields";
import { autoFormDetectionOperationConfig } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionOperation";
import { defaultParameters } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";

const DETECT_ENDPOINT = "/api/v1/form/form-detection/detect";

function pdfFile(): File {
  return new File(["%PDF-1.4 dummy"], "doc.pdf", { type: "application/pdf" });
}

const process = autoFormDetectionOperationConfig.customProcessor;

describe("processAutoFormDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.post as Mock).mockResolvedValue({ data: { detections: [] } });
  });

  it("asks the server for fields, then applies them locally", async () => {
    const { files } = await process(defaultParameters, [pdfFile()]);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body] = (apiClient.post as Mock).mock.calls[0];
    expect(url).toBe(DETECT_ENDPOINT);
    expect((body as FormData).get("applyToPdf")).toBe("false");
    expect(applyFields).toHaveBeenCalledTimes(1);
    expect(files[0].name).toBe("doc_form.pdf");
  });

  it("sends the sensitivity's confidence threshold", async () => {
    await process({ ...defaultParameters, sensitivity: "low" }, [pdfFile()]);

    const body = (apiClient.post as Mock).mock.calls[0][1] as FormData;
    expect(body.get("confThreshold")).toBe("0.45");
  });

  it("re-requests a server-applied PDF when applying locally fails", async () => {
    expectConsole.warn(/applying fields locally failed/);
    (applyFields as Mock).mockRejectedValueOnce(new Error("bad xref"));
    (apiClient.post as Mock).mockResolvedValueOnce({
      data: { detections: [] },
    });
    (apiClient.post as Mock).mockResolvedValueOnce({
      data: new Blob(["%PDF-1.4 applied"]),
    });

    const { files } = await process(defaultParameters, [pdfFile()]);

    expect(apiClient.post).toHaveBeenCalledTimes(2);
    const body = (apiClient.post as Mock).mock.calls[1][1] as FormData;
    expect(body.get("applyToPdf")).toBe("true");
    expect(files[0].name).toBe("doc_form.pdf");
  });
});
