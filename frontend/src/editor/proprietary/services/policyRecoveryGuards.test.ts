import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNewStirlingFileStub,
  createStirlingFile,
  type StirlingFileStub,
} from "@app/types/fileContext";
import {
  recordRunStart,
  resetPolicyRuns,
} from "@app/components/policies/policyRunStore";
import { registerPolicyWorkspace } from "@app/services/policyBlockRegistry";
import {
  PolicyBlockedError,
  assertFilesNotBlocked,
} from "@app/services/policyFileGuard";
import { updatePolicy } from "@app/services/policyStorage";
import { downloadFile } from "@app/services/downloadService";
import { uploadHistoryChain } from "@app/services/serverStorageUpload";
import { fileStorage } from "@app/services/fileStorage";
import { buildHistoryBundle } from "@app/services/serverStorageBundle";
import apiClient from "@app/services/apiClient";

vi.mock("@app/services/apiClient", () => ({
  default: { post: vi.fn(), put: vi.fn() },
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getHistoryChainStubs: vi.fn(), getStirlingFile: vi.fn() },
}));
vi.mock("@app/services/serverStorageBundle", () => ({
  buildHistoryBundle: vi.fn(),
}));
vi.mock("@app/i18n", () => ({ default: { t: (key: string) => key } }));

let files: StirlingFileStub[];
let unregister: () => void;
let source: StirlingFileStub;
const pdf = new File(["pdf"], "file.pdf", { type: "application/pdf" });

function fail() {
  recordRunStart({
    runId: "failure",
    policyKey: "security",
    fileId: source.id,
    fileName: source.name,
    fileSize: 3,
    target: "local",
    status: "FAILED",
    error: "offline",
    outputs: [],
    startedAt: 1,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetPolicyRuns();
  updatePolicy("security", { required: true });
  source = createNewStirlingFileStub(pdf);
  files = [source];
  unregister = registerPolicyWorkspace(() => files);
});
afterEach(() => {
  unregister();
  vi.restoreAllMocks();
});

describe("policy recovery boundaries", () => {
  it("blocks immediately, including downloads without a source id", async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    fail();
    expect(() => assertFilesNotBlocked()).toThrow(PolicyBlockedError);
    await expect(
      downloadFile({ data: pdf, filename: pdf.name }),
    ).rejects.toThrow(PolicyBlockedError);
    expect(click).not.toHaveBeenCalled();
    files = [];
    expect(() => assertFilesNotBlocked()).not.toThrow();
    await expect(
      downloadFile({ data: pdf, filename: pdf.name, fileId: source.id }),
    ).rejects.toThrow(PolicyBlockedError);
  });

  it("blocks an open derivative even after the failed input was consumed", () => {
    const child = createNewStirlingFileStub(pdf);
    child.sourceFileIds = [source.id];
    files = [child];
    fail();
    expect(() => assertFilesNotBlocked()).toThrow(PolicyBlockedError);
  });

  it("refuses a server upload when a policy fails while its bundle is being prepared", async () => {
    vi.mocked(fileStorage.getHistoryChainStubs).mockResolvedValue([source]);
    vi.mocked(fileStorage.getStirlingFile).mockResolvedValue(
      createStirlingFile(pdf, source.id),
    );
    vi.mocked(buildHistoryBundle).mockImplementationOnce(async () => {
      fail();
      // Closing the source while preparation finishes must not authorize its captured bytes.
      files = [];
      return { bundleFile: pdf, manifest: {} } as Awaited<
        ReturnType<typeof buildHistoryBundle>
      >;
    });
    await expect(uploadHistoryChain(source.id)).rejects.toThrow(
      PolicyBlockedError,
    );
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it("allows ordinary pipeline failures to continue", () => {
    updatePolicy("security", { required: false });
    fail();
    expect(() => assertFilesNotBlocked([source.id])).not.toThrow();
  });
});
