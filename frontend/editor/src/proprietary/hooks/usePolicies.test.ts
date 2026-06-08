import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePolicies } from "@app/hooks/usePolicies";

// Enable/delete create + remove the backing Watch Folders SmartFolder
// (IndexedDB); jsdom's crypto lacks randomUUID, used for folder ids.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  const orig = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: orig?.getRandomValues?.bind(orig),
    randomUUID: () =>
      `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  });
}

// A minimal wizard result (workflow already saved by the builder).
const wizardResult = {
  automation: {
    id: "auto-1",
    name: "Test",
    operations: [{ operation: "compress", parameters: {} }],
    createdAt: "",
    updatedAt: "",
  },
  fieldValues: {},
  sources: ["editor"],
  scopeTypes: [],
  reviewerEmail: "reviewer@x.com",
  folder: {
    outputMode: "new_file" as const,
    outputName: "",
    outputNamePosition: "prefix" as const,
    maxRetries: 3,
    retryDelayMinutes: 5,
  },
};

describe("usePolicies", () => {
  beforeEach(() => localStorage.clear());

  it("seeds ingestion active and the rest unconfigured", () => {
    const { result } = renderHook(() => usePolicies());
    expect(result.current.policies.ingestion.configured).toBe(true);
    expect(result.current.policies.ingestion.status).toBe("active");
    expect(result.current.policies.security.configured).toBe(false);
  });

  it("enabling a policy marks it configured + active with a backing folder", async () => {
    const { result } = renderHook(() => usePolicies());
    await act(async () => {
      await result.current.enablePolicy("security", wizardResult);
    });
    expect(result.current.policies.security.configured).toBe(true);
    expect(result.current.policies.security.status).toBe("active");
    expect(result.current.policies.security.folderId).toBeTruthy();
    expect(result.current.policies.security.reviewerEmail).toBe(
      "reviewer@x.com",
    );
  });

  it("pausing then resuming flips status", async () => {
    const { result } = renderHook(() => usePolicies());
    await act(async () => {
      await result.current.pausePolicy("ingestion");
    });
    expect(result.current.policies.ingestion.status).toBe("paused");
    await act(async () => {
      await result.current.resumePolicy("ingestion");
    });
    expect(result.current.policies.ingestion.status).toBe("active");
  });

  it("deleting a policy reverts it to unconfigured and drops the folder link", async () => {
    const { result } = renderHook(() => usePolicies());
    await act(async () => {
      await result.current.enablePolicy("routing", wizardResult);
    });
    expect(result.current.policies.routing.configured).toBe(true);
    await act(async () => {
      await result.current.deletePolicy("routing");
    });
    expect(result.current.policies.routing.configured).toBe(false);
    expect(result.current.policies.routing.status).toBe("default");
    expect(result.current.policies.routing.folderId).toBeUndefined();
  });

  it("ensurePolicyFolder creates a backing folder for a folderless policy", async () => {
    const { result } = renderHook(() => usePolicies());
    // The seeded ingestion policy is active but has no backing folder.
    expect(result.current.policies.ingestion.configured).toBe(true);
    expect(result.current.policies.ingestion.folderId).toBeUndefined();
    await act(async () => {
      await result.current.ensurePolicyFolder("ingestion");
    });
    expect(result.current.policies.ingestion.folderId).toBeTruthy();
  });

  it("spend limit is disabled by default (no warning/reached)", () => {
    const { result } = renderHook(() => usePolicies());
    expect(result.current.spendLimitReached).toBe(false);
    expect(result.current.spendLimitWarning).toBe(false);
  });
});
