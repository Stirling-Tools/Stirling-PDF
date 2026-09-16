import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  recordRunStart,
  resetPolicyRuns,
  updateRun,
} from "@app/components/policies/policyRunStore";
import type { PolicyState } from "@app/types/policies";

const cache = vi.hoisted(() => ({ value: {} as Record<string, PolicyState> }));

vi.mock("@app/services/policyStorage", () => ({
  loadPolicies: () => cache.value,
  onPoliciesChange: () => () => {},
}));
vi.mock("@app/services/policyCatalog", () => ({
  loadPolicyCatalog: () => ({
    categories: [
      { id: "classification", label: "Classification" },
      { id: "security", label: "Security" },
    ],
  }),
}));

import { useEditorPipelines } from "@app/components/policies/useEditorPipelines";

const policy = (over: Partial<PolicyState> = {}): PolicyState => ({
  configured: true,
  enabled: true,
  backendId: "be-1",
  runsOnEditor: true,
  sources: [],
  scopeTypes: [],
  reviewerEmail: "",
  fieldValues: {},
  ...over,
});

const run = (policyKey: string, startedAt: number) => ({
  runId: `run-${policyKey}-${startedAt}`,
  policyKey,
  fileId: "file-1",
  fileName: "doc.pdf",
  fileSize: 1,
  target: "server" as never,
  status: "PENDING" as const,
  outputs: [],
  error: null,
  startedAt,
});

describe("useEditorPipelines", () => {
  beforeEach(() => {
    resetPolicyRuns();
    cache.value = {};
  });

  it("splits the editor's pipelines by the event that fires them", () => {
    cache.value = {
      classification: policy({ backendId: "be-c" }),
      security: policy({ backendId: "be-s", runOn: "export" }),
    };
    const { result } = renderHook(() => useEditorPipelines());

    expect(result.current.onImport.map((p) => p.label)).toEqual([
      "Classification",
    ]);
    expect(result.current.onExport.map((p) => p.label)).toEqual(["Security"]);
    expect(result.current.total).toBe(2);
  });

  it("omits policies the engines would not run on this editor", () => {
    cache.value = {
      unconfigured: policy({ configured: false }),
      paused: policy({ enabled: false }),
      serverOnly: policy({ runsOnEditor: false }),
      neverPersisted: policy({ backendId: undefined }),
    };
    const { result } = renderHook(() => useEditorPipelines());

    expect(result.current.total).toBe(0);
  });

  it("orders each group by the chain order the engines dispatch in", () => {
    cache.value = {
      second: policy({ backendId: "be-2", order: 2, name: "Second" }),
      first: policy({ backendId: "be-1", order: 1, name: "First" }),
    };
    const { result } = renderHook(() => useEditorPipelines());

    expect(result.current.onImport.map((p) => p.label)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("reports a pipeline as running while one of its runs is in flight", () => {
    cache.value = { classification: policy({ backendId: "be-c" }) };
    const { result, rerender } = renderHook(() => useEditorPipelines());
    expect(result.current.onImport[0].running).toBe(false);

    act(() => recordRunStart(run("classification", Date.now())));
    rerender();

    expect(result.current.onImport[0].running).toBe(true);
  });

  it("flags a pipeline whose most recent settled run failed", () => {
    cache.value = { classification: policy({ backendId: "be-c" }) };
    const { result, rerender } = renderHook(() => useEditorPipelines());

    const record = run("classification", Date.now());
    act(() => recordRunStart(record));
    act(() => updateRun(record.runId, { status: "FAILED" }));
    rerender();

    expect(result.current.onImport[0].failed).toBe(true);
    expect(result.current.onImport[0].running).toBe(false);
  });

  it("counts only runs recorded since local midnight", () => {
    cache.value = { classification: policy({ backendId: "be-c" }) };
    const yesterday = new Date().setHours(0, 0, 0, 0) - 60_000;
    const { result, rerender } = renderHook(() => useEditorPipelines());

    act(() => recordRunStart(run("classification", yesterday)));
    act(() => recordRunStart(run("classification", Date.now())));
    rerender();

    expect(result.current.onImport[0].runsToday).toBe(1);
  });
});
