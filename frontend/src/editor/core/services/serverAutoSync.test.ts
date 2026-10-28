import { describe, it, expect } from "vitest";
import { AxiosError } from "axios";
import {
  canAutoSync,
  classifySyncFailure,
} from "@editor/services/serverAutoSync";
import type { StirlingFileStub } from "@editor/types/fileContext";

function stub(overrides: Partial<StirlingFileStub> = {}): StirlingFileStub {
  return {
    id: "v2",
    isLeaf: true,
    remoteStorageId: 7,
    remoteOwnedByCurrentUser: true,
    remoteSync: { revision: "r1", leafId: "v1" },
    ...overrides,
  } as StirlingFileStub;
}

function httpError(status?: number): AxiosError {
  const error = new AxiosError("request failed");
  if (status !== undefined) {
    error.response = { status } as AxiosError["response"];
  }
  return error;
}

describe("canAutoSync", () => {
  it("accepts an owned leaf edited since its sync base", () => {
    expect(canAutoSync(stub())).toBe(true);
  });

  it.each([
    ["the leaf is the synced content", { id: "v1" }],
    ["it is an older version", { isLeaf: false }],
    ["it was never synced with a revision", { remoteSync: undefined }],
    ["someone else owns the server copy", { remoteOwnedByCurrentUser: false }],
    ["it came from a share link", { remoteSharedViaLink: true }],
    ["it is not on the server", { remoteStorageId: undefined }],
  ])("rejects a file when %s", (_reason, overrides) => {
    expect(canAutoSync(stub(overrides as Partial<StirlingFileStub>))).toBe(
      false,
    );
  });
});

describe("classifySyncFailure", () => {
  it("treats a refused base revision as a conflict", () => {
    expect(classifySyncFailure(httpError(409))).toBe("conflict");
  });

  it("treats a request with no response as offline", () => {
    expect(classifySyncFailure(httpError())).toBe("offline");
  });

  it("treats other failures as errors", () => {
    expect(classifySyncFailure(httpError(413))).toBe("error");
    expect(classifySyncFailure(new Error("No history chain found."))).toBe(
      "error",
    );
  });
});
