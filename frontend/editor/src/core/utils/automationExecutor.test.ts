import { beforeEach, describe, expect, type Mock, test, vi } from "vitest";
import apiClient from "@app/services/apiClient";
import type { ToolRegistry } from "@app/data/toolsTaxonomy";
import { ToolType } from "@app/hooks/tools/shared/useToolOperation";
import {
  executeToolOperation,
  processMultiFileResponse,
} from "@app/utils/automationExecutor";

vi.mock("@app/services/apiClient", () => ({
  default: {
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient);

// Regression coverage for the automation-side mirror of the merge bug:
// non-canonical Content-Types previously misrouted a PDF into ZIP extraction
// and yielded a bogus `automation_*.zip`.

const PDF_BYTES = new Uint8Array([
  0x25,
  0x50,
  0x44,
  0x46,
  0x2d,
  0x31,
  0x2e,
  0x37, // "%PDF-1.7"
  0x0a,
  0x25,
  0xe2,
  0xe3,
  0xcf,
  0xd3,
  0x0a,
]);

const inputFiles = [
  new File(["fake"], "input.pdf", { type: "application/pdf" }),
];

async function run(contentType: string) {
  return processMultiFileResponse(
    new Blob([PDF_BYTES]),
    { "content-type": contentType },
    inputFiles,
    "automated_",
    false,
  );
}

describe("processMultiFileResponse (automation execution)", () => {
  test('PDF body + "application/octet-stream" -> PDF, not .zip', async () => {
    const result = await run("application/octet-stream");
    expect(result.length).toBe(1);
    expect(result[0].name).not.toMatch(/\.zip$/);
  });

  test('PDF body + "application/pdf;charset=UTF-8" -> PDF, not .zip', async () => {
    const result = await run("application/pdf;charset=UTF-8");
    expect(result.length).toBe(1);
    expect(result[0].name).not.toMatch(/\.zip$/);
  });

  test('PDF body + "APPLICATION/PDF" -> PDF, not .zip', async () => {
    const result = await run("APPLICATION/PDF");
    expect(result.length).toBe(1);
    expect(result[0].name).not.toMatch(/\.zip$/);
  });
});

describe("executeToolOperation (automation execution)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockedApiClient.post as Mock).mockResolvedValue({
      data: new Blob([PDF_BYTES], { type: "application/pdf" }),
      headers: { "content-type": "application/pdf" },
    });
  });

  test("does not impose a client-side operation timeout", async () => {
    const toolRegistry = {
      compress: {
        operationConfig: {
          operationType: "compress",
          toolType: ToolType.singleFile,
          endpoint: "/api/v1/misc/compress-pdf",
          defaultParameters: {},
          buildFormData: (_parameters: unknown, file: File) => {
            const formData = new FormData();
            formData.append("fileInput", file);
            return formData;
          },
        },
      },
    } as unknown as ToolRegistry;

    await executeToolOperation("compress", {}, inputFiles, toolRegistry);

    expect(mockedApiClient.post).toHaveBeenCalledWith(
      "/api/v1/misc/compress-pdf",
      expect.any(FormData),
      { responseType: "blob" },
    );
  });
});
