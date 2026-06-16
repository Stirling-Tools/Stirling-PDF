import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// Enable/delete create + remove the backing Watched Folders WatchedFolder
// (IndexedDB); jsdom's crypto lacks randomUUID, used for folder ids.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  const orig = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: orig?.getRandomValues?.bind(orig),
    randomUUID: () =>
      `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
  });
}

// In-memory stand-in for the backend policy store, so the hook's persistence
// path is exercised without a real server.
const api = vi.hoisted(() => ({
  store: new Map<string, { id: string }>(),
  seq: 0,
}));
vi.mock("@app/services/policyApi", () => ({
  listPolicies: vi.fn(async () => [...api.store.values()]),
  savePolicy: vi.fn(async (p: { id?: string }) => {
    const id = p.id && p.id.length > 0 ? p.id : `be-${++api.seq}`;
    const saved = { ...p, id };
    api.store.set(id, saved);
    return saved;
  }),
  getPolicy: vi.fn(async (id: string) => api.store.get(id)),
  deletePolicy: vi.fn(async (id: string) => {
    api.store.delete(id);
  }),
  runStoredPolicy: vi.fn(),
  runPolicyPipeline: vi.fn(),
  getPolicyRun: vi.fn(),
}));

import { usePolicies } from "@app/hooks/usePolicies";

// A minimal wizard result (workflow already saved + mapped by the builder).
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
    runOn: "upload" as const,
    outputMode: "new_file" as const,
    outputName: "",
    outputNamePosition: "prefix" as const,
    maxRetries: 3,
    retryDelayMinutes: 5,
  },
  pipelineSteps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
  unresolvedOps: [],
};

describe("usePolicies", () => {
  beforeEach(() => {
    localStorage.clear();
    api.store.clear();
    api.seq = 0;
  });

  it("starts with every category unconfigured (no seed)", async () => {
    const { result } = renderHook(() => usePolicies());
    // Flush the async mount reconcile (empty backend ⇒ all stay unconfigured).
    await act(async () => {});
    expect(result.current.policies.ingestion.configured).toBe(false);
    expect(result.current.policies.security.configured).toBe(false);
  });

  it("enabling a policy persists it to the backend + marks it configured", async () => {
    const { result } = renderHook(() => usePolicies());
    await act(async () => {
      await result.current.enablePolicy("security", wizardResult);
    });
    await waitFor(() =>
      expect(result.current.policies.security.configured).toBe(true),
    );
    expect(result.current.policies.security.status).toBe("active");
    expect(result.current.policies.security.folderId).toBeTruthy();
    expect(result.current.policies.security.backendId).toBeTruthy();
    expect(result.current.policies.security.reviewerEmail).toBe(
      "reviewer@x.com",
    );
    // The mapped pipeline (endpoint path) reached the backend store.
    const stored = [...api.store.values()][0] as unknown as {
      steps: unknown[];
    };
    expect(stored.steps).toHaveLength(1);
  });

  it("reconciles configured policies from the backend on mount", async () => {
    // Enable on one instance (persists to the backend store)...
    const first = renderHook(() => usePolicies());
    await act(async () => {
      await first.result.current.enablePolicy("security", wizardResult);
    });
    // ...a fresh instance should pick it up from the backend.
    const second = renderHook(() => usePolicies());
    await waitFor(() =>
      expect(second.result.current.policies.security.configured).toBe(true),
    );
    expect(second.result.current.policies.security.backendId).toBeTruthy();
  });

  it("pausing then resuming flips status", async () => {
    const { result } = renderHook(() => usePolicies());
    await act(async () => {
      await result.current.enablePolicy("ingestion", wizardResult);
    });
    await act(async () => {
      await result.current.pausePolicy("ingestion");
    });
    expect(result.current.policies.ingestion.status).toBe("paused");
    await act(async () => {
      await result.current.resumePolicy("ingestion");
    });
    expect(result.current.policies.ingestion.status).toBe("active");
  });

  it("deleting a policy reverts it + removes it from the backend", async () => {
    const { result } = renderHook(() => usePolicies());
    await act(async () => {
      await result.current.enablePolicy("routing", wizardResult);
    });
    await waitFor(() =>
      expect(result.current.policies.routing.configured).toBe(true),
    );
    await act(async () => {
      await result.current.deletePolicy("routing");
    });
    expect(result.current.policies.routing.configured).toBe(false);
    expect(result.current.policies.routing.status).toBe("default");
    expect(result.current.policies.routing.folderId).toBeUndefined();
    expect(result.current.policies.routing.backendId).toBeUndefined();
    expect(api.store.size).toBe(0);
  });

  it("ensurePolicyFolder creates a backing folder for a folderless policy", async () => {
    const { result } = renderHook(() => usePolicies());
    await act(async () => {
      await result.current.ensurePolicyFolder("ingestion");
    });
    expect(result.current.policies.ingestion.folderId).toBeTruthy();
  });
});
