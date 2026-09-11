import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPolicyOnFile } from "@app/services/policyDispatch";
import { runStoredPolicy } from "@app/services/policyApi";
import { fileStorage } from "@app/services/fileStorage";
import { isFileBlocked } from "@app/services/policyBlockRegistry";
import * as runStore from "@app/components/policies/policyRunStore";
import { createStirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

vi.mock("@app/services/policyApi", () => ({
  runStoredPolicy: vi.fn(),
  resolvePolicyRunTarget: () => "local",
}));
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getStirlingFile: vi.fn() },
}));

const fileId = "input" as FileId;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  localStorage.clear();
  runStore.resetPolicyRuns();
  localStorage.setItem(
    "stirling-policies-state",
    JSON.stringify({ security: { required: true } }),
  );
  vi.mocked(fileStorage.getStirlingFile).mockResolvedValue(
    createStirlingFile(
      new File(["%PDF"], "doc.pdf", { type: "application/pdf" }),
      fileId,
    ),
  );
  vi.mocked(runStoredPolicy).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("upload-policy dispatch failures", () => {
  it("records request failure as a durable block with recovery after a successful retry", async () => {
    const recorded = vi.spyOn(runStore, "recordRunStart");
    vi.mocked(runStoredPolicy).mockRejectedValueOnce(
      new Error("Backend offline"),
    );
    await runPolicyOnFile("security", "backend", fileId, "doc.pdf");

    expect(recorded).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: expect.stringMatching(/^dispatch-failed:/),
        status: "FAILED",
        fileId,
        policyKey: "security",
        error: "Backend offline",
        target: "local",
      }),
    );
    expect(runStore.isDispatched("security", fileId)).toBe(true);
    expect(isFileBlocked(fileId)).toBe(true);
    const saved = localStorage.getItem("stirling-policy-runs")!;
    runStore.resetPolicyRuns();
    localStorage.setItem("stirling-policy-runs", saved);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "stirling-policy-runs" }),
    );
    expect(isFileBlocked(fileId)).toBe(true);

    vi.setSystemTime(2000);
    vi.mocked(runStoredPolicy).mockResolvedValueOnce("retry");
    await runPolicyOnFile("security", "backend", fileId, "doc.pdf");
    expect(isFileBlocked(fileId)).toBe(true);
    runStore.updateRun("retry", { status: "COMPLETED" });
    expect(isFileBlocked(fileId)).toBe(false);
  });

  it("records an optional pipeline failure without blocking the file", async () => {
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({ security: { required: false } }),
    );
    vi.mocked(runStoredPolicy).mockRejectedValueOnce(
      new Error("Backend offline"),
    );
    await runPolicyOnFile("security", "backend", fileId, "doc.pdf");
    expect(
      runStore.getPolicyRunOutcomes()[runStore.dispatchKey("security", fileId)]
        ?.status,
    ).toBe("FAILED");
    expect(isFileBlocked(fileId)).toBe(false);
  });

  it("does not let an older request failing late override a newer successful attempt", async () => {
    vi.mocked(runStoredPolicy)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new Error("Request timed out")), 1000);
          }),
      )
      .mockResolvedValueOnce("retry");
    const older = runPolicyOnFile("security", "backend", fileId, "doc.pdf");
    await vi.advanceTimersByTimeAsync(1);
    await runPolicyOnFile("security", "backend", fileId, "doc.pdf");
    runStore.updateRun("retry", { status: "COMPLETED" });
    await vi.runAllTimersAsync();
    await older;
    expect(isFileBlocked(fileId)).toBe(false);
  });
});
