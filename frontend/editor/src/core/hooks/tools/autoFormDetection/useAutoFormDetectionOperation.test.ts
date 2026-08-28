import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
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
import { onSummary } from "@app/services/formDetection/progress";
import { autoFormDetectionOperationConfig } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionOperation";
import { defaultParameters } from "@app/hooks/tools/autoFormDetection/useAutoFormDetectionParameters";

const DETECT_ENDPOINT = "/api/v1/form/form-detection/detect";

function pdfFile(): File {
  return new File(["%PDF-1.4 dummy"], "doc.pdf", { type: "application/pdf" });
}

const SUMMARY =
  '{"total":11,"byType":{"text":8,"checkbox":3},"pagesWithFields":1}';

function respond(
  headers: Record<string, string> = { "x-stirling-detected-fields": SUMMARY },
) {
  (apiClient.post as Mock).mockResolvedValue({
    data: new Blob(["%PDF-1.4 applied"]),
    headers,
  });
}

const process = autoFormDetectionOperationConfig.customProcessor;

describe("processAutoFormDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    respond();
  });

  it("asks the server to apply the fields and returns the PDF it sends back", async () => {
    const { files } = await process(defaultParameters, [pdfFile()]);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = (apiClient.post as Mock).mock.calls[0];
    expect(url).toBe(DETECT_ENDPOINT);
    expect((body as FormData).get("applyToPdf")).toBe("true");
    expect(config).toMatchObject({ responseType: "blob" });
    expect(files[0].name).toBe("doc_form.pdf");
    expect(files[0].type).toBe("application/pdf");
  });

  it("sends the sensitivity's confidence threshold", async () => {
    await process({ ...defaultParameters, sensitivity: "low" }, [pdfFile()]);

    const body = (apiClient.post as Mock).mock.calls[0][1] as FormData;
    expect(body.get("confThreshold")).toBe("0.45");
  });

  it("publishes the summary the server reported", async () => {
    respond({ "x-stirling-detected-fields": SUMMARY });
    const seen: unknown[] = [];
    const stop = onSummary((s) => seen.push(s));

    await process(defaultParameters, [pdfFile()]);
    stop();

    expect(seen).toEqual([
      { total: 11, byType: { text: 8, checkbox: 3 }, pagesWithFields: 1 },
    ]);
  });

  it("still returns the PDF when the summary header is missing or malformed", async () => {
    expectConsole.warn(/no X-Stirling-Detected-Fields header/);
    respond({ "x-stirling-detected-fields": "not json" });
    const seen: unknown[] = [];
    const stop = onSummary((s) => seen.push(s));

    const { files } = await process(defaultParameters, [pdfFile()]);
    stop();

    expect(seen).toEqual([]);
    expect(files[0].name).toBe("doc_form.pdf");
  });
});
