import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({ default: mocks }));
vi.mock("@app/services/serverAutomationSession", () => ({
  requireAutomationSession: vi.fn(),
}));
vi.mock("@app/services/usageLimitBridge", () => ({
  dispatchPaygLimitReached: vi.fn(),
}));
import {
  submitServerPipeline,
  waitForServerPipeline,
  downloadServerPipelineOutput,
} from "@app/services/serverPipeline";
import { dispatchPaygLimitReached } from "@app/services/usageLimitBridge";
const session = { key: "account", baseUrl: "https://connected.test" };
beforeEach(() => vi.clearAllMocks());

test("pipeline submission pins the server and account and sends multipart inputs", async () => {
  mocks.post.mockResolvedValue({ data: { jobId: "run-id" } });
  const file = new File(["pdf"], "input.pdf");
  await expect(
    submitServerPipeline(
      session,
      "Folder",
      [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      [file],
    ),
  ).resolves.toBe("run-id");
  const [url, form, config] = mocks.post.mock.calls[0];
  expect(url).toBe("https://connected.test/api/v1/policies/run");
  expect(form.get("fileInput").name).toBe("input.pdf");
  expect(form.get("json").type).toBe("application/json");
  expect(config.automationSession).toBe("account");
});

test("server credit rejection is surfaced and no output is downloaded", async () => {
  mocks.get.mockResolvedValue({
    data: {
      status: "FAILED",
      error: "Credit limit",
      errorCode: "PAYG_LIMIT_REACHED",
      errorSubscribed: true,
    },
  });
  await expect(waitForServerPipeline(session, "run-id")).rejects.toThrow(
    "Credit limit",
  );
  expect(dispatchPaygLimitReached).toHaveBeenCalledWith(true);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});

test("outputs download from the connected server with the pinned account", async () => {
  mocks.get.mockResolvedValue({ data: new Blob(["pdf"]) });
  await downloadServerPipelineOutput(session, {
    fileId: "output",
    fileName: "result.pdf",
  });
  expect(mocks.get).toHaveBeenCalledWith(
    "https://connected.test/api/v1/general/files/output",
    {
      responseType: "blob",
      automationSession: "account",
    },
  );
});
