import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// In-memory stand-in for the backend policy store, so the hook's reconcile path
// is exercised without a real server. The editor only reads policies now, so the
// read (`listPolicies`) is all the hook touches.
const api = vi.hoisted(() => ({ store: new Map<string, { id: string }>() }));
vi.mock("@app/services/policyApi", () => ({
  listPolicies: vi.fn(async () => [...api.store.values()]),
}));

import { usePolicies } from "@app/hooks/usePolicies";

describe("usePolicies", () => {
  beforeEach(() => {
    localStorage.clear();
    api.store.clear();
  });

  it("starts with every category unconfigured (no seed)", async () => {
    const { result } = renderHook(() => usePolicies());
    // Flush the async mount reconcile (empty backend ⇒ all stay unconfigured).
    await act(async () => {});
    expect(result.current.policies.ingestion.configured).toBe(false);
    expect(result.current.policies.security.configured).toBe(false);
  });

  it("reconciles a configured category policy from the backend on mount", async () => {
    api.store.set("be-sec", {
      id: "be-sec",
      name: "Security",
      enabled: true,
      steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      output: { type: "inline", options: { categoryId: "security" } },
      editor: { allowed: true, runOn: "upload" },
    } as unknown as { id: string });

    const { result } = renderHook(() => usePolicies());
    await waitFor(() =>
      expect(result.current.policies.security.configured).toBe(true),
    );
    expect(result.current.policies.security.backendId).toBe("be-sec");
  });

  // A builder pipeline has no category tile, so the reconcile must key it by id to reach the map
  // the auto-run iterates.
  it("reconciles a builder pipeline that has no category", async () => {
    api.store.set("be-pipeline", {
      id: "be-pipeline",
      name: "My pipeline",
      enabled: true,
      inputs: [],
      steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      output: { type: "inline", options: {} },
      outputIds: [],
      editor: { allowed: true, runOn: "upload" },
    } as unknown as { id: string });

    const { result } = renderHook(() => usePolicies());

    await waitFor(() =>
      expect(result.current.policies["be-pipeline"]?.configured).toBe(true),
    );
    const pipeline = result.current.policies["be-pipeline"];
    expect(pipeline.runsOnEditor).toBe(true);
    // Not a catalogue tile, so it is deletable rather than a built-in default.
    expect(pipeline.isDefault).toBe(false);
  });

  it("does not put a builder pipeline on the editor unless it opts in", async () => {
    api.store.set("be-s3", {
      id: "be-s3",
      name: "S3 sweep",
      enabled: true,
      inputs: [],
      steps: [{ operation: "/api/v1/misc/compress-pdf", parameters: {} }],
      output: { type: "inline", options: {} },
      outputIds: [],
    } as unknown as { id: string });

    const { result } = renderHook(() => usePolicies());

    await waitFor(() =>
      expect(result.current.policies["be-s3"]?.configured).toBe(true),
    );
    expect(result.current.policies["be-s3"].runsOnEditor).toBe(false);
  });

  // Deleting a pipeline on the Pipelines page leaves its cached entry behind. It still satisfies
  // every auto-run condition but its backendId is dead, so the dispatch fails, the run never
  // completes, and every policy behind it in the chain is skipped on every upload.
  it("forgets a builder pipeline the backend no longer has", async () => {
    localStorage.setItem(
      "stirling-policies-state",
      JSON.stringify({
        "be-deleted": {
          configured: true,
          enabled: true,
          backendId: "be-deleted",
          sources: ["editor"],
          runsOnEditor: true,
          runOn: "upload",
          isDefault: false,
        },
      }),
    );

    const { result } = renderHook(() => usePolicies());

    await waitFor(() =>
      expect(result.current.policies["be-deleted"]).toBeUndefined(),
    );
    // A catalogue tile is never forgotten: it reseeds from the catalogue.
    expect(result.current.policies.security).toBeDefined();
  });
});
