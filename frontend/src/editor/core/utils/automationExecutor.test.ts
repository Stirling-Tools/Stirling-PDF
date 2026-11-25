import { beforeEach, describe, expect, type Mock, test, vi } from "vitest";
import JSZip from "jszip";
import apiClient from "@editor/services/apiClient";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { ToolType } from "@editor/hooks/tools/shared/useToolOperation";
import {
  executeAutomationSequence,
  executeToolOperation,
  processMultiFileResponse,
} from "@editor/utils/automationExecutor";
import type { AutomationConfig } from "@editor/types/automation";
import {
  rememberPdfAccess,
  setSignedPdfEditPolicy,
} from "@editor/services/pdfAccessService";

vi.mock("@editor/services/apiClient", () => ({
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

  test("prefixes zipped outputs without eating underscores in their names", async () => {
    const zip = new JSZip();
    zip.file("my_report_1.pdf", PDF_BYTES);
    zip.file("my_report_2.pdf", PDF_BYTES);
    const result = await processMultiFileResponse(
      await zip.generateAsync({ type: "blob" }),
      { "content-type": "application/zip" },
      inputFiles,
      "Nightly_",
      false,
    );
    expect(result.map((f) => f.name).sort()).toEqual([
      "Nightly_my_report_1.pdf",
      "Nightly_my_report_2.pdf",
    ]);
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

describe("executeAutomationSequence (automation execution)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockedApiClient.post as Mock).mockResolvedValue({
      data: new Blob([PDF_BYTES], { type: "application/pdf" }),
      headers: { "content-type": "application/pdf" },
    });
  });

  test("keeps each input's file name", async () => {
    const step = {
      operationConfig: {
        toolType: ToolType.singleFile,
        endpoint: "/api/v1/misc/compress-pdf",
        defaultParameters: {},
        buildFormData: (_parameters: unknown, file: File) => {
          const formData = new FormData();
          formData.append("fileInput", file);
          return formData;
        },
      },
    };
    const toolRegistry = {
      compress: step,
      repair: step,
    } as unknown as ToolRegistry;
    const automation = {
      id: "release-prep",
      name: "Records release prep",
      operations: [
        { operation: "compress", parameters: {} },
        { operation: "repair", parameters: {} },
      ],
    } as unknown as AutomationConfig;

    const result = await executeAutomationSequence(
      automation,
      [
        new File(["a"], "01_cover_letter.pdf", { type: "application/pdf" }),
        new File(["b"], "03_memo_followup_scan.pdf", {
          type: "application/pdf",
        }),
      ],
      toolRegistry,
    );

    expect(result.map((f) => f.name)).toEqual([
      "01_cover_letter.pdf",
      "03_memo_followup_scan.pdf",
    ]);
  });
});

describe("automation steps on a signed PDF while edits are blocked", () => {
  const registry = (endpoint: string) =>
    ({
      step: {
        operationConfig: {
          operationType: "step",
          toolType: ToolType.singleFile,
          endpoint,
          defaultParameters: {},
          buildFormData: (_parameters: unknown, file: File) => {
            const formData = new FormData();
            formData.append("fileInput", file);
            return formData;
          },
        },
      },
    }) as unknown as ToolRegistry;

  function signedFile() {
    const file = new File(["%PDF-1.7"], "signed.pdf", {
      type: "application/pdf",
    });
    rememberPdfAccess(file, {
      password: "",
      encrypted: false,
      signed: true,
      ownerAuthenticated: false,
      permissions: -4,
      pageCount: 1,
    });
    return file;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setSignedPdfEditPolicy(true);
    (mockedApiClient.post as Mock).mockResolvedValue({
      data: new Blob([PDF_BYTES], { type: "application/pdf" }),
      headers: { "content-type": "application/pdf" },
    });
  });

  test("refuses a step that rewrites the PDF", async () => {
    await expect(
      executeToolOperation(
        "step",
        {},
        [signedFile()],
        registry("/api/v1/general/rotate-pdf"),
      ),
    ).rejects.toThrow("digitally signed");
    expect(mockedApiClient.post).not.toHaveBeenCalled();
    setSignedPdfEditPolicy(false);
  });

  test("runs a step that only converts it", async () => {
    await executeToolOperation(
      "step",
      {},
      [signedFile()],
      registry("/api/v1/convert/pdf/img"),
    );
    expect(mockedApiClient.post).toHaveBeenCalled();
    setSignedPdfEditPolicy(false);
  });
});
