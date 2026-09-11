import { beforeEach, describe, expect, it } from "vitest";
import {
  getPolicyBlock,
  isFileBlocked,
} from "@app/services/policyBlockRegistry";
import {
  recordRunStart,
  resetPolicyRuns,
  updateRun,
} from "@app/components/policies/policyRunStore";
import { createFileSelectors } from "@app/contexts/file/fileSelectors";
import { initialFileContextState } from "@app/contexts/file/FileReducer";
import type { FileId } from "@app/types/file";

beforeEach(() => {
  localStorage.clear();
  resetPolicyRuns();
  localStorage.setItem(
    "stirling-policies-state",
    JSON.stringify({ security: { required: true } }),
  );
});

describe("synchronous policy blocking", () => {
  it("blocks exports and tools before FileContext has mirrored a failure", () => {
    const fileId = "file-1" as FileId;
    recordRunStart({
      runId: "failed",
      policyKey: "security",
      fileId,
      fileName: "doc.pdf",
      fileSize: 1,
      target: "local",
      status: "FAILED",
      outputs: [],
      error: "failed",
      startedAt: 1,
    });
    const selectors = createFileSelectors(
      { current: initialFileContextState },
      { current: new Map() },
    );
    expect(initialFileContextState.ui.policyBlocks).toEqual({});
    expect(isFileBlocked(fileId)).toBe(true);
    expect(selectors.getPolicyBlock(fileId)).toBe("security");

    updateRun("failed", { status: "COMPLETED" });
    expect(getPolicyBlock(fileId)).toBeUndefined();
    expect(selectors.getPolicyBlock(fileId)).toBeUndefined();
  });
});
