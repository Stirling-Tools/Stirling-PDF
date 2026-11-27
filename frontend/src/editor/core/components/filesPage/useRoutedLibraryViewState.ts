import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLibraryViewState } from "@editor/components/filesPage/useLibraryViewState";
import type { FilesPageTab } from "@editor/contexts/FilesPageContext";
import type { FolderId } from "@editor/types/folder";

/** Bare /files opens Recents; a folder path only makes sense in Stirling library. */
function defaultTab(folderId: FolderId | null): FilesPageTab {
  return folderId === null ? "recent" : "all";
}

function folderFromPath(pathname: string): FolderId | null {
  const match = pathname.match(/^\/files\/([^/]+)\/?$/);
  return (match?.[1] as FolderId | undefined) ?? null;
}

function tabFromRoute(pathname: string, search: string): FilesPageTab {
  const view = new URLSearchParams(search).get("view");
  switch (view) {
    case "all":
    case "recent":
    case "cloud":
    case "shared":
    case "sharedByMe":
      return view;
    default:
      return defaultTab(folderFromPath(pathname));
  }
}

/** The page's URL owns its tab and folder; filters and selection stay in per-tab memory. */
export function useRoutedLibraryViewState() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeTab = tabFromRoute(location.pathname, location.search);
  const view = useLibraryViewState(routeTab, routeTab);
  const {
    currentTab,
    setCurrentTab: selectTab,
    folderForTab,
    setCurrentFolderId: rememberFolder,
  } = view;

  useEffect(() => {
    const match = location.pathname.match(/^\/files(?:\/([^/]+))?\/?$/);
    if (!match) return;
    rememberFolder((match[1] as FolderId | undefined) ?? null);
  }, [location.pathname, location.search, rememberFolder]);

  const navigateToView = useCallback(
    (tab: FilesPageTab, folderId: FolderId | null) => {
      const path = folderId === null ? "/files" : `/files/${folderId}`;
      const target =
        tab === defaultTab(folderId) ? path : `${path}?view=${tab}`;
      selectTab(tab);
      if (target !== `${location.pathname}${location.search}`) navigate(target);
    },
    [location.pathname, location.search, navigate, selectTab],
  );
  const setCurrentTab = useCallback(
    (tab: FilesPageTab) => {
      if (tab !== currentTab) navigateToView(tab, folderForTab(tab));
    },
    [currentTab, folderForTab, navigateToView],
  );
  const openFolder = useCallback(
    (id: FolderId | null) => navigateToView("all", id),
    [navigateToView],
  );

  return { ...view, setCurrentTab, openFolder };
}
