import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import { createStirlingFile } from "@editor/types/fileContext";
import { ToolType } from "@editor/hooks/tools/shared/useToolOperation";
import type { ToolRegistry } from "@editor/data/toolsTaxonomy";
import { executeToolOperation } from "@editor/utils/automationExecutor";
import {
  clearPdfAccess,
  ensureLocalPdfAccess,
  inspectLocalPdfAccess,
  setSignedPdfEditPolicy,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import {
  assertSignedPdfsEditable,
  preflightPdfOperation,
  signedPdfEditRefused,
} from "@editor/services/pdfSessionUnlock";

vi.mock("@editor/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@editor/services/pdfAccessService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@editor/services/pdfAccessService")
  >()),
  ensureLocalPdfAccess: vi.fn(),
  inspectLocalPdfAccess: vi.fn(),
}));

const signed: PdfAccess = {
  password: "",
  encrypted: false,
  signed: true,
  ownerAuthenticated: false,
  permissions: -1,
  pageCount: 1,
};
const ensure = vi.mocked(ensureLocalPdfAccess);
const inspect = vi.mocked(inspectLocalPdfAccess);
const unread = () =>
  createStirlingFile(
    new File(["%PDF-1.7"], "signed.pdf", { type: "application/pdf" }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  clearPdfAccess();
  setSignedPdfEditPolicy(true);
  ensure.mockResolvedValue(signed);
  inspect.mockResolvedValue(signed);
});
afterEach(() => setSignedPdfEditPolicy(false));

describe("signed PDFs nobody has opened yet", () => {
  it("refuses a browser-side editor once preflight has read the file", async () => {
    const file = unread();
    await expect(
      preflightPdfOperation(
        [file],
        undefined,
        false,
        vi.fn(),
        undefined,
        undefined,
        true,
      ),
    ).rejects.toThrow("digitally signed");
    expect(ensure).toHaveBeenCalledWith(file, undefined);
  });

  it("lets a tool with no endpoint that only reads the file through", async () => {
    await expect(
      preflightPdfOperation([unread()], undefined, false, vi.fn()),
    ).resolves.toBe(true);
  });

  it("reads the file for add-password without remembering it", async () => {
    await expect(
      preflightPdfOperation(
        [unread()],
        "/api/v1/security/add-password",
        false,
        vi.fn(),
      ),
    ).rejects.toThrow("digitally signed");
    expect(inspect).toHaveBeenCalledOnce();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("does not read password-tool inputs while the setting is off", async () => {
    setSignedPdfEditPolicy(false);
    await expect(
      preflightPdfOperation(
        [unread()],
        "/api/v1/security/add-password",
        false,
        vi.fn(),
      ),
    ).resolves.toBe(true);
    expect(inspect).not.toHaveBeenCalled();
  });

  it("treats an endpoint without declared output as a rewrite", () => {
    expect(signedPdfEditRefused(signed, "/api/v1/form/fill")).toBe(true);
    expect(
      signedPdfEditRefused(signed, "/api/v1/misc/extract-single-attachment"),
    ).toBe(false);
  });

  it("skips reading files when the tool cannot rewrite them", async () => {
    await assertSignedPdfsEditable(
      [unread()],
      "/api/v1/convert/pdf/img",
      false,
    );
    expect(ensure).not.toHaveBeenCalled();
  });

  it("reads every automation step's input, not just the first", async () => {
    const registry = {
      step: {
        operationConfig: {
          operationType: "step",
          toolType: ToolType.singleFile,
          endpoint: "/api/v1/general/rotate-pdf",
          defaultParameters: {},
          buildFormData: () => new FormData(),
        },
      },
    } as unknown as ToolRegistry;
    const intermediate = new File(["%PDF-1.7"], "step-1.pdf", {
      type: "application/pdf",
    });
    await expect(
      executeToolOperation("step", {}, [intermediate], registry),
    ).rejects.toThrow("digitally signed");
    expect(ensure).toHaveBeenCalledWith(intermediate, undefined);
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
