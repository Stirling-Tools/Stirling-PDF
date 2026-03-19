/**
 * URL synchronization for Watch Folders workbench.
 * Manages /watch-folders and /watch-folders/:slug routes
 * where :slug is derived from the folder name (e.g. "My Invoices" → "my-invoices").
 */

import { useEffect, useRef, useMemo } from 'react';
import { BASE_PATH, withBasePath } from '@app/constants/app';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useAllSmartFolders } from '@app/hooks/useAllSmartFolders';

// Inlined to avoid circular imports — must match SmartFoldersRegistration.tsx
const SMART_FOLDER_VIEW_ID = 'smartFolder';
const SMART_FOLDER_WORKBENCH_ID = 'custom:smartFolder';

const WATCH_FOLDERS_BASE = '/watch-folders';

export function slugifyFolderName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'folder';
}

function parseWatchFolderRoute(): { isWatchFolder: boolean; slug: string | null } {
  const fullPath = window.location.pathname;
  const path = BASE_PATH && fullPath.startsWith(BASE_PATH)
    ? fullPath.slice(BASE_PATH.length) || '/'
    : fullPath;

  if (path === WATCH_FOLDERS_BASE || path === WATCH_FOLDERS_BASE + '/') {
    return { isWatchFolder: true, slug: null };
  }
  if (path.startsWith(WATCH_FOLDERS_BASE + '/')) {
    const slug = path.slice(WATCH_FOLDERS_BASE.length + 1);
    return { isWatchFolder: true, slug: slug || null };
  }
  return { isWatchFolder: false, slug: null };
}

function isWatchFolderUrl(): boolean {
  const fullPath = window.location.pathname;
  const path = BASE_PATH && fullPath.startsWith(BASE_PATH)
    ? fullPath.slice(BASE_PATH.length) || '/'
    : fullPath;
  return path === WATCH_FOLDERS_BASE || path.startsWith(WATCH_FOLDERS_BASE + '/');
}

export function useWatchFolderUrlSync() {
  const folders = useAllSmartFolders();
  const navigationState = useNavigationState();
  const { actions } = useNavigationActions();
  const { setCustomWorkbenchViewData, customWorkbenchViews } = useToolWorkflow();

  const isWatchFolderWorkbench = navigationState.workbench === SMART_FOLDER_WORKBENCH_ID;

  // Current folderId from view data
  const viewData = customWorkbenchViews.find(v => v.id === SMART_FOLDER_VIEW_ID)?.data as
    | { folderId: string | null } | null | undefined;
  const folderId = viewData?.folderId ?? null;

  // Slug ↔ ID maps rebuilt whenever folders change
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

  // Keep refs so effects/handlers don't go stale
  const setDataRef = useRef(setCustomWorkbenchViewData);
  const actionsRef = useRef(actions);
  const slugToIdRef = useRef(slugToId);
  const foldersRef = useRef(folders);
  useEffect(() => { setDataRef.current = setCustomWorkbenchViewData; });
  useEffect(() => { actionsRef.current = actions; });
  useEffect(() => { slugToIdRef.current = slugToId; });
  useEffect(() => { foldersRef.current = folders; });

  // Slug captured from URL on mount — 'none' means not a watch-folder URL
  const mountSlugRef = useRef<string | null | 'none'>('none');
  const hasMountNavigated = useRef(false);
  // Slug that still needs resolving once folders load
  const pendingSlugRef = useRef<string | null>(null);

  // Phase 1a: Capture URL slug on mount (no navigation yet — view not registered)
  useEffect(() => {
    const { isWatchFolder, slug } = parseWatchFolderRoute();
    if (isWatchFolder) {
      mountSlugRef.current = slug; // null = home page
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Phase 1b: Navigate once the view is registered in customWorkbenchViews.
  // We wait for registration so that ToolWorkflowContext's null-data guard doesn't
  // boot us back to home immediately after setWorkbench is called.
  useEffect(() => {
    if (hasMountNavigated.current) return;
    if (mountSlugRef.current === 'none') return; // not a watch-folder URL

    const isRegistered = customWorkbenchViews.some(v => v.id === SMART_FOLDER_VIEW_ID);
    if (!isRegistered) return;

    hasMountNavigated.current = true;
    const slug = mountSlugRef.current; // null = home

    if (!slug) {
      // Home — set data + workbench together so guard sees non-null data
      setDataRef.current(SMART_FOLDER_VIEW_ID, { folderId: null });
      actionsRef.current.setWorkbench(SMART_FOLDER_WORKBENCH_ID as any);
      return;
    }

    // Set a placeholder so the null-data guard doesn't fire while we resolve
    setDataRef.current(SMART_FOLDER_VIEW_ID, { folderId: null });
    actionsRef.current.setWorkbench(SMART_FOLDER_WORKBENCH_ID as any);

    if (foldersRef.current.length > 0) {
      const id = slugToIdRef.current.get(slug) ?? null;
      setDataRef.current(SMART_FOLDER_VIEW_ID, { folderId: id });
    } else {
      pendingSlugRef.current = slug;
    }
  }, [customWorkbenchViews]);

  // Resolve pending slug once folders load
  useEffect(() => {
    if (!pendingSlugRef.current || folders.length === 0) return;
    const slug = pendingSlugRef.current;
    pendingSlugRef.current = null;
    const id = slugToId.get(slug) ?? null;
    setDataRef.current(SMART_FOLDER_VIEW_ID, { folderId: id });
  }, [folders, slugToId]);

  // Phase 2: State → URL — push URL when workbench or folderId changes
  const prevIsWatchFolder = useRef(false);
  useEffect(() => {
    if (isWatchFolderWorkbench) {
      const slug = folderId ? (idToSlug.get(folderId) ?? null) : null;
      const targetPath = slug
        ? withBasePath(`${WATCH_FOLDERS_BASE}/${slug}`)
        : withBasePath(WATCH_FOLDERS_BASE);
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    } else if (prevIsWatchFolder.current && isWatchFolderUrl()) {
      window.history.pushState(null, '', withBasePath('/'));
    }
    prevIsWatchFolder.current = isWatchFolderWorkbench;
  }, [isWatchFolderWorkbench, folderId, idToSlug]);

  // Phase 3: popstate → State — handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const { isWatchFolder, slug } = parseWatchFolderRoute();
      if (!isWatchFolder) return;

      if (!slug) {
        setDataRef.current(SMART_FOLDER_VIEW_ID, { folderId: null });
        actionsRef.current.setWorkbench(SMART_FOLDER_WORKBENCH_ID as any);
        return;
      }

      setDataRef.current(SMART_FOLDER_VIEW_ID, { folderId: null }); // placeholder
      actionsRef.current.setWorkbench(SMART_FOLDER_WORKBENCH_ID as any);

      if (foldersRef.current.length > 0) {
        const id = slugToIdRef.current.get(slug) ?? null;
        setDataRef.current(SMART_FOLDER_VIEW_ID, { folderId: id });
      } else {
        pendingSlugRef.current = slug;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
