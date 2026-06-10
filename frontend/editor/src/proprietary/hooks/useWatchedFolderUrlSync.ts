/**
 * URL synchronization for Watched Folders workbench.
 * Manages /watch-folders and /watch-folders/:slug routes
 * where :slug is derived from the folder name (e.g. "My Invoices" → "my-invoices").
 */

import { useEffect, useRef, useMemo } from "react";
import { BASE_PATH, withBasePath } from "@app/constants/app";
import {
  useNavigationState,
  useNavigationActions,
} from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useAllWatchedFolders } from "@app/hooks/useAllWatchedFolders";

// Inlined to avoid circular imports — must match WatchedFoldersRegistration.tsx
const WATCHED_FOLDER_VIEW_ID = "watchedFolder";
const WATCHED_FOLDER_WORKBENCH_ID = "custom:watchedFolder";

const WATCHED_FOLDERS_BASE = "/watch-folders";

export function slugifyFolderName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "folder"
  );
}

function parseWatchedFolderRoute(): {
  isWatchedFolder: boolean;
  slug: string | null;
} {
  const fullPath = window.location.pathname;
  const path =
    BASE_PATH && fullPath.startsWith(BASE_PATH)
      ? fullPath.slice(BASE_PATH.length) || "/"
      : fullPath;

  if (path === WATCHED_FOLDERS_BASE || path === WATCHED_FOLDERS_BASE + "/") {
    return { isWatchedFolder: true, slug: null };
  }
  if (path.startsWith(WATCHED_FOLDERS_BASE + "/")) {
    const slug = path.slice(WATCHED_FOLDERS_BASE.length + 1);
    return { isWatchedFolder: true, slug: slug || null };
  }
  return { isWatchedFolder: false, slug: null };
}

function isWatchedFolderUrl(): boolean {
  const fullPath = window.location.pathname;
  const path =
    BASE_PATH && fullPath.startsWith(BASE_PATH)
      ? fullPath.slice(BASE_PATH.length) || "/"
      : fullPath;
  return (
    path === WATCHED_FOLDERS_BASE || path.startsWith(WATCHED_FOLDERS_BASE + "/")
  );
}

export function useWatchedFolderUrlSync() {
  const folders = useAllWatchedFolders();
  const navigationState = useNavigationState();
  const { actions } = useNavigationActions();
  const { setCustomWorkbenchViewData, customWorkbenchViews } =
    useToolWorkflow();

  const isWatchedFolderWorkbench =
    navigationState.workbench === WATCHED_FOLDER_WORKBENCH_ID;

  const viewData = customWorkbenchViews.find(
    (v) => v.id === WATCHED_FOLDER_VIEW_ID,
  )?.data as { folderId: string | null } | null | undefined;
  const folderId = viewData?.folderId ?? null;

  const { slugToId, idToSlug } = useMemo(() => {
    const s2i = new Map<string, string>();
    const i2s = new Map<string, string>();
    for (const f of folders) {
      const slug = slugifyFolderName(f.name);
      if (!s2i.has(slug)) s2i.set(slug, f.id);
      i2s.set(f.id, slug);
    }
    return { slugToId: s2i, idToSlug: i2s };
  }, [folders]);

  const setDataRef = useRef(setCustomWorkbenchViewData);
  const actionsRef = useRef(actions);
  const slugToIdRef = useRef(slugToId);
  const foldersRef = useRef(folders);
  useEffect(() => {
    setDataRef.current = setCustomWorkbenchViewData;
  });
  useEffect(() => {
    actionsRef.current = actions;
  });
  useEffect(() => {
    slugToIdRef.current = slugToId;
  });
  useEffect(() => {
    foldersRef.current = folders;
  });

  const mountSlugRef = useRef<string | null | "none">("none");
  const hasMountNavigated = useRef(false);
  const pendingSlugRef = useRef<string | null>(null);

  // Phase 1a: capture URL slug on mount
  useEffect(() => {
    const { isWatchedFolder, slug } = parseWatchedFolderRoute();
    if (isWatchedFolder) {
      mountSlugRef.current = slug;
    }
  }, []);

  // Phase 1b: navigate once the view is registered
  useEffect(() => {
    if (hasMountNavigated.current) return;
    if (mountSlugRef.current === "none") return;

    const isRegistered = customWorkbenchViews.some(
      (v) => v.id === WATCHED_FOLDER_VIEW_ID,
    );
    if (!isRegistered) return;

    hasMountNavigated.current = true;
    const slug = mountSlugRef.current;

    if (!slug) {
      setDataRef.current(WATCHED_FOLDER_VIEW_ID, { folderId: null });
      actionsRef.current.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);
      return;
    }

    setDataRef.current(WATCHED_FOLDER_VIEW_ID, { folderId: null });
    actionsRef.current.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);

    if (foldersRef.current.length > 0) {
      const id = slugToIdRef.current.get(slug) ?? null;
      setDataRef.current(WATCHED_FOLDER_VIEW_ID, { folderId: id });
    } else {
      pendingSlugRef.current = slug;
    }
  }, [customWorkbenchViews]);

  useEffect(() => {
    if (!pendingSlugRef.current || folders.length === 0) return;
    const slug = pendingSlugRef.current;
    pendingSlugRef.current = null;
    const id = slugToId.get(slug) ?? null;
    setDataRef.current(WATCHED_FOLDER_VIEW_ID, { folderId: id });
  }, [folders, slugToId]);

  // Phase 2: State → URL
  const prevIsWatchedFolder = useRef(false);
  useEffect(() => {
    if (isWatchedFolderWorkbench) {
      const slug = folderId ? (idToSlug.get(folderId) ?? null) : null;
      const targetPath = slug
        ? withBasePath(`${WATCHED_FOLDERS_BASE}/${slug}`)
        : withBasePath(WATCHED_FOLDERS_BASE);
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, "", targetPath);
      }
    } else if (prevIsWatchedFolder.current && isWatchedFolderUrl()) {
      window.history.pushState(null, "", withBasePath("/"));
    }
    prevIsWatchedFolder.current = isWatchedFolderWorkbench;
  }, [isWatchedFolderWorkbench, folderId, idToSlug]);

  // Phase 3: popstate → State
  useEffect(() => {
    const handlePopState = () => {
      const { isWatchedFolder, slug } = parseWatchedFolderRoute();
      if (!isWatchedFolder) return;

      if (!slug) {
        setDataRef.current(WATCHED_FOLDER_VIEW_ID, { folderId: null });
        actionsRef.current.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);
        return;
      }

      setDataRef.current(WATCHED_FOLDER_VIEW_ID, { folderId: null });
      actionsRef.current.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);

      if (foldersRef.current.length > 0) {
        const id = slugToIdRef.current.get(slug) ?? null;
        setDataRef.current(WATCHED_FOLDER_VIEW_ID, { folderId: id });
      } else {
        pendingSlugRef.current = slug;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
}
