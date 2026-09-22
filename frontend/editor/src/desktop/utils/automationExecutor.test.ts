import { beforeEach, expect, test, vi } from "vitest";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  wait: vi.fn(),
  download: vi.fn(),
  local: vi.fn(),
}));
vi.mock("@core/utils/automationExecutor", () => ({
  executeToolOperation: mocks.local,
  executeToolOperationWithPrefix: mocks.local,
  processMultiFileResponse: vi.fn(),
}));
vi.mock("@app/services/serverAutomationSession", () => ({
  getServerAutomationSession: async () => ({
    key: "owner",
    baseUrl: "https://server.test",
  }),
}));
vi.mock("@app/services/serverPipeline", () => ({
  submitServerPipeline: mocks.submit,
  waitForServerPipeline: mocks.wait,
  downloadServerPipelineOutput: mocks.download,
}));
import { executeAutomationSequence } from "@app/utils/automationExecutor";
import { ToolType } from "@app/hooks/tools/shared/useToolOperation";

beforeEach(() => {
  vi.resetAllMocks();
});
test("sends locally supported tool steps together and never calls the local executor", async () => {
  const buildFormData = () => {
    const form = new FormData();
    form.append("quality", "50");
    form.append("pageNumbers", "1");
    form.append("pageNumbers", "3");
    return form;
  };
  const registry = {
    compress: {
      operationConfig: {
        toolType: ToolType.singleFile,
        endpoint: "/api/v1/misc/compress-pdf",
        buildFormData,
        defaultParameters: {},
      },
    },
    rotate: {
      operationConfig: {
        toolType: ToolType.singleFile,
        endpoint: "/api/v1/general/rotate-pdf",
        buildFormData,
        defaultParameters: {},
      },
    },
  } as unknown as ToolRegistry;
  mocks.submit.mockResolvedValue("run");
  mocks.wait.mockResolvedValue({
    outputs: [{ fileId: "output", fileName: "result.pdf" }],
  });
  const output = new File(["output"], "result.pdf");
  mocks.download.mockResolvedValue(output);
  const result = await executeAutomationSequence(
    {
      id: "auto",
      name: "Pipeline",
      operations: [
        { operation: "compress", parameters: {} },
        { operation: "rotate", parameters: {} },
      ],
      createdAt: "",
      updatedAt: "",
    },
    [new File(["input"], "input.pdf")],
    registry,
  );
  expect(result).toEqual([output]);
  expect(mocks.submit).toHaveBeenCalledTimes(1);
  expect(mocks.submit.mock.calls[0][2]).toEqual([
    {
      operation: "/api/v1/misc/compress-pdf",
      parameters: { quality: "50", pageNumbers: ["1", "3"] },
      fileParameters: {},
    },
    {
      operation: "/api/v1/general/rotate-pdf",
      parameters: { quality: "50", pageNumbers: ["1", "3"] },
      fileParameters: {},
    },
  ]);
  expect(mocks.local).not.toHaveBeenCalled();
});

test("custom tools use their server parameter mapping without invoking their processor", async () => {
  const registry = {
    convert: {
      operationConfig: {
        toolType: ToolType.custom,
        endpoint: () => "/api/v1/convert/pdf/img",
        defaultParameters: { toExtension: "png" },
        toApiParams: (params: { toExtension: string }) => ({
          imageFormat: params.toExtension,
          colorType: "color",
        }),
        customProcessor: mocks.local,
      },
    },
  } as unknown as ToolRegistry;
  mocks.submit.mockResolvedValue("run");
  mocks.wait.mockResolvedValue({ outputs: [] });
  await executeAutomationSequence(
    {
      id: "convert",
      name: "Convert pipeline",
      operations: [{ operation: "convert", parameters: {} }],
      createdAt: "",
      updatedAt: "",
    },
    [new File(["input"], "input.pdf")],
    registry,
  );
  expect(mocks.submit.mock.calls[0][2]).toEqual([
    {
      operation: "/api/v1/convert/pdf/img",
      parameters: { imageFormat: "png", colorType: "color" },
      fileParameters: {},
    },
  ]);
  expect(mocks.local).not.toHaveBeenCalled();
});
