import { useCallback, useState, type SetStateAction } from "react";
import type {
  FilesPageOriginFilter,
  FilesPageSortMode,
  FilesPageTab,
} from "@app/contexts/FilesPageContext";
import type { FileId } from "@app/types/file";
import type { FolderId } from "@app/types/folder";

interface LibraryView {
  currentFolderId: FolderId | null;
  search: string;
  sortMode: FilesPageSortMode;
  originFilter: FilesPageOriginFilter;
  typeFilter: string[];
  selectedFileIds: Set<FileId>;
}

const createView = (): LibraryView => ({
  currentFolderId: null,
  search: "",
  sortMode: "modified-desc",
  originFilter: "all",
  typeFilter: [],
  selectedFileIds: new Set(),
});

/** Remembers each tab for this host's lifetime. A controlled tab keeps routing authoritative during pending navigation. */
export function useLibraryViewState(
  initialTab: FilesPageTab,
  controlledTab?: FilesPageTab,
) {
  const [state, setState] = useState(() => ({
    currentTab: initialTab,
    views: { [initialTab]: createView() } as Partial<
      Record<FilesPageTab, LibraryView>
    >,
  }));
  const update = useCallback((change: (view: LibraryView) => LibraryView) => {
    setState((previous) => {
      const view = previous.views[previous.currentTab]!;
      const next = change(view);
      return next === view
        ? previous
        : {
            ...previous,
            views: { ...previous.views, [previous.currentTab]: next },
          };
    });
  }, []);
  const setCurrentTab = useCallback((currentTab: FilesPageTab) => {
    setState((previous) =>
      previous.currentTab === currentTab
        ? previous
        : {
            currentTab,
            views: {
              ...previous.views,
              [currentTab]: previous.views[currentTab] ?? createView(),
            },
          },
    );
  }, []);
  if (controlledTab !== undefined && state.currentTab !== controlledTab) {
    setCurrentTab(controlledTab);
  }
  const folderForTab = useCallback(
    (tab: FilesPageTab) => state.views[tab]?.currentFolderId ?? null,
    [state.views],
  );
  const setCurrentFolderId = useCallback(
    (currentFolderId: FolderId | null) => {
      update((view) =>
        view.currentFolderId === currentFolderId
          ? view
          : {
              ...view,
              currentFolderId,
              selectedFileIds: new Set(),
            },
      );
    },
    [update],
  );
  const setSearch = useCallback(
    (search: string) => update((view) => ({ ...view, search })),
    [update],
  );
  const setSortMode = useCallback(
    (sortMode: FilesPageSortMode) => update((view) => ({ ...view, sortMode })),
    [update],
  );
  const setOriginFilter = useCallback(
    (originFilter: FilesPageOriginFilter) =>
      update((view) => ({ ...view, originFilter })),
    [update],
  );
  const setTypeFilter = useCallback(
    (typeFilter: string[]) => update((view) => ({ ...view, typeFilter })),
    [update],
  );
  const setSelectedFileIds = useCallback(
    (value: SetStateAction<Set<FileId>>) => {
      update((view) => ({
        ...view,
        selectedFileIds:
          typeof value === "function" ? value(view.selectedFileIds) : value,
      }));
    },
    [update],
  );
  const clearSelection = useCallback(
    () => setSelectedFileIds(new Set()),
    [setSelectedFileIds],
  );
  return {
    ...state.views[state.currentTab]!,
    currentTab: state.currentTab,
    setCurrentTab,
    folderForTab,
    setCurrentFolderId,
    setSearch,
    setSortMode,
    setOriginFilter,
    setTypeFilter,
    setSelectedFileIds,
    clearSelection,
  };
}
