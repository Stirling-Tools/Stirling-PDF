import type { ReactNode } from "react";
import { act, render, renderHook } from "@testing-library/react";
import {
  MemoryRouter,
  NavigationType,
  Router,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { useRoutedLibraryViewState } from "@app/components/filesPage/useRoutedLibraryViewState";
import type { FileId } from "@app/types/file";
import type { FolderId } from "@app/types/folder";

function setup(initialEntries: string[]) {
  return renderHook(
    () => ({
      ...useRoutedLibraryViewState(),
      location: useLocation(),
      navigate: useNavigate(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
      ),
    },
  );
}

describe("library browser history", () => {
  it("restores the view when Back cancels a tab transition before its URL commits", () => {
    const navigator = {
      createHref: () => "",
      go: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    };
    let library!: ReturnType<typeof useRoutedLibraryViewState>;
    function Library() {
      library = useRoutedLibraryViewState();
      return null;
    }
    const { rerender } = render(
      <Router
        location="/files/invoices"
        navigationType={NavigationType.Push}
        navigator={navigator}
      >
        <Library />
      </Router>,
    );
    act(() => library.setCurrentTab("recent"));
    expect(library.currentTab).toBe("all");
    expect(navigator.push).toHaveBeenCalledOnce();

    rerender(
      <Router
        location="/files/invoices"
        navigationType={NavigationType.Pop}
        navigator={navigator}
      >
        <Library />
      </Router>,
    );
    expect(library.currentTab).toBe("all");
    expect(library.currentFolderId).toBe("invoices");
  });

  it("opens Recents from a direct link and restores it with Back and Forward", () => {
    const { result } = setup(["/files?view=recent"]);
    expect(result.current.currentTab).toBe("recent");

    act(() => result.current.setCurrentTab("all"));
    expect(result.current.location.search).toBe("");
    expect(result.current.currentTab).toBe("all");

    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toBe("?view=recent");
    expect(result.current.currentTab).toBe("recent");

    act(() => result.current.navigate(1));
    expect(result.current.currentTab).toBe("all");
  });

  it("remembers each tab's filters and selection when history returns to a folder", () => {
    const { result } = setup(["/files/invoices"]);
    const selected = new Set(["invoice" as FileId]);
    act(() => {
      result.current.setSearch("invoice");
      result.current.setSelectedFileIds(selected);
      result.current.setCurrentTab("recent");
      result.current.setSearch("notes");
      result.current.setOriginFilter("local");
    });
    expect(result.current.location.pathname).toBe("/files");
    expect(result.current.location.search).toBe("?view=recent");
    expect(result.current.search).toBe("notes");

    act(() => result.current.navigate(-1));
    expect(result.current).toMatchObject({
      currentTab: "all",
      currentFolderId: "invoices",
      search: "invoice",
      selectedFileIds: selected,
    });

    act(() => result.current.navigate(1));
    expect(result.current).toMatchObject({
      currentTab: "recent",
      currentFolderId: null,
      search: "notes",
      originFilter: "local",
    });

    act(() => result.current.setCurrentTab("all"));
    expect(result.current.location.pathname).toBe("/files/invoices");
    expect(result.current.selectedFileIds).toEqual(selected);
  });

  it("opens a sidebar folder in one history step without changing Recent's filters", () => {
    const { result } = setup(["/files?view=recent"]);
    act(() => {
      result.current.setSearch("draft");
      result.current.setOriginFilter("local");
      result.current.openFolder("invoices" as FolderId);
      result.current.setOriginFilter("all");
    });
    expect(result.current).toMatchObject({
      currentTab: "all",
      currentFolderId: "invoices",
      originFilter: "all",
    });
    expect(result.current.location.search).toBe("");

    act(() => result.current.navigate(-1));
    expect(result.current).toMatchObject({
      currentTab: "recent",
      search: "draft",
      originFilter: "local",
    });

    act(() => result.current.navigate(1));
    expect(result.current.currentFolderId).toBe("invoices");
  });

  it("does not add history entries when the active tab or folder is clicked again", () => {
    const { result } = setup(["/editor", "/files?view=recent"]);
    act(() => result.current.setCurrentTab("recent"));
    act(() => result.current.navigate(-1));
    expect(result.current.location.pathname).toBe("/editor");

    act(() => result.current.navigate(1));
    act(() => result.current.openFolder(null));
    act(() => result.current.openFolder(null));
    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toBe("?view=recent");
    expect(result.current.currentTab).toBe("recent");
  });

  it("restores folder navigation within Stirling library", () => {
    const { result } = setup(["/files/invoices"]);
    act(() => result.current.openFolder("receipts" as FolderId));
    act(() => result.current.navigate(-1));
    expect(result.current.currentTab).toBe("all");
    expect(result.current.currentFolderId).toBe("invoices");
    act(() => result.current.navigate(1));
    expect(result.current.currentFolderId).toBe("receipts");
  });

  it("uses Stirling library for an unrecognized view", () => {
    const { result } = setup(["/files?view=unknown"]);
    expect(result.current.currentTab).toBe("all");
    expect(result.current.currentFolderId).toBeNull();
  });
});
