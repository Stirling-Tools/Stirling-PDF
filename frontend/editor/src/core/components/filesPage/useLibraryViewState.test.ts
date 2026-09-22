import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLibraryViewState } from "@app/components/filesPage/useLibraryViewState";
import type { FolderId } from "@app/types/folder";
import type { FileId } from "@app/types/file";
import type { FilesPageTab } from "@app/contexts/FilesPageContext";

describe("library view memory", () => {
  it("keeps a pending destination's filter updates separate from the visible routed tab", () => {
    const { result, rerender } = renderHook(
      ({ tab }: { tab: FilesPageTab }) => useLibraryViewState("all", tab),
      { initialProps: { tab: "all" as FilesPageTab } },
    );
    act(() => {
      result.current.setSearch("invoice");
      result.current.setCurrentTab("recent");
      result.current.setSearch("draft");
    });
    expect(result.current.currentTab).toBe("all");
    expect(result.current.search).toBe("invoice");
    rerender({ tab: "recent" });
    expect(result.current.currentTab).toBe("recent");
    expect(result.current.search).toBe("draft");
  });

  it("restores folder, filters, ordering and selection independently for each tab", () => {
    const { result } = renderHook(() => useLibraryViewState("all"));
    const folder = "invoices" as FolderId;
    const file = "invoice" as FileId;
    act(() => {
      result.current.setCurrentFolderId(folder);
      result.current.setSearch("invoice");
      result.current.setSortMode("name-desc");
      result.current.setOriginFilter("cloud");
      result.current.setTypeFilter(["PDF"]);
      result.current.setSelectedFileIds(new Set([file]));
      result.current.setCurrentTab("recent");
      result.current.setSearch("notes");
      result.current.setOriginFilter("local");
    });
    expect(result.current.currentFolderId).toBeNull();
    expect(result.current.selectedFileIds.size).toBe(0);
    act(() => result.current.setCurrentTab("all"));
    expect(result.current).toMatchObject({
      currentFolderId: folder,
      search: "invoice",
      sortMode: "name-desc",
      originFilter: "cloud",
      typeFilter: ["PDF"],
      selectedFileIds: new Set([file]),
    });
    act(() => result.current.setCurrentTab("recent"));
    expect(result.current).toMatchObject({
      search: "notes",
      originFilter: "local",
    });
  });

  it("keeps selection when restoring the same folder but clears it when navigating to another", () => {
    const { result } = renderHook(() => useLibraryViewState("all"));
    act(() => {
      result.current.setCurrentFolderId("invoices" as FolderId);
      result.current.setSelectedFileIds(new Set(["invoice" as FileId]));
      result.current.setCurrentFolderId("invoices" as FolderId);
    });
    expect(result.current.selectedFileIds.size).toBe(1);
    act(() => result.current.setCurrentFolderId(null));
    expect(result.current.selectedFileIds.size).toBe(0);
  });

  it("keeps separate hosts independent and makes reselecting the active tab a no-op", () => {
    const picker = renderHook(() => useLibraryViewState("recent"));
    const library = renderHook(() => useLibraryViewState("all"));
    act(() => {
      picker.result.current.setSearch("draft");
      picker.result.current.setCurrentTab("recent");
    });
    expect(picker.result.current.search).toBe("draft");
    expect(library.result.current.search).toBe("");
    expect(library.result.current.currentTab).toBe("all");
  });
});
