import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { WatchedFolder } from "@app/types/watchedFolders";
import { useAllWatchedFolders } from "@app/hooks/useAllWatchedFolders";

const state = vi.hoisted(() => ({
  enabled: false,
  folders: [] as WatchedFolder[],
}));

vi.mock("@core/hooks/useAllWatchedFolders", () => ({
  useAllWatchedFolders: () => state.folders,
}));
vi.mock("@app/components/policies/usePoliciesEnabled", () => ({
  usePoliciesEnabled: () => state.enabled,
}));

beforeEach(() => {
  state.enabled = false;
  state.folders = [
    {
      id: "invoices",
      name: "Invoices",
      description: "",
      automationId: "classify",
      icon: "folder",
      accentColor: "",
      createdAt: "2026-09-16T00:00:00Z",
      updatedAt: "2026-09-16T00:00:00Z",
    },
  ];
});

describe("desktop watched folders", () => {
  test("keeps the disabled snapshot stable so membership effects settle", () => {
    const { result, rerender } = renderHook(useAllWatchedFolders);
    const disabled = result.current;
    expect(disabled).toEqual([]);

    state.folders = [...state.folders];
    rerender();

    expect(result.current).toBe(disabled);
  });

  test("exposes stored folders only while automation is enabled", () => {
    const { result, rerender } = renderHook(useAllWatchedFolders);
    const disabled = result.current;

    state.enabled = true;
    rerender();
    expect(result.current).toBe(state.folders);

    state.enabled = false;
    rerender();
    expect(result.current).toBe(disabled);
  });
});
