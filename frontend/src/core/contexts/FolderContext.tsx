/**
 * FolderContext - state management for the cloud folder hierarchy.
 *
 * The server is the source of truth. This context maintains an in-memory copy
 * (sourced from a small IDB read-cache for instant first paint), and every
 * mutation goes server-first via `folderSyncService`; on success the local
 * cache is updated and a revision tick fires so consumers re-render.
 *
 * The local IDB cache only exists so:
 *   1. The tree paints immediately on mount without waiting for the API.
 *   2. We can show a read-only tree when the server is unreachable.
 *
 * Cycle detection, ownership checks, and the per-user folder cap all live
 * on the server. The client just surfaces 400/409 errors via the existing
 * dialog Alert pattern.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { folderStorage } from "@app/services/folderStorage";
import { folderSyncService } from "@app/services/folderSyncService";
import {
  FolderBreadcrumbEntry,
  FolderId,
  FolderRecord,
  FolderTreeNode,
  ROOT_FOLDER_ID,
  createFolderId,
  pickFolderColor,
} from "@app/types/folder";
import { useIndexedDB } from "@app/contexts/IndexedDBContext";

interface FolderContextValue {
  folders: FolderRecord[];
  foldersById: Map<FolderId, FolderRecord>;
  tree: FolderTreeNode[];
  loading: boolean;
  error: string | null;
  /** Push a user-visible error string to the banner; null clears it. */
  setError: (msg: string | null) => void;

  /**
   * Whether the most recent server round-trip succeeded. Used to gate folder
   * mutation controls - when false, "New folder", rename, move, delete, and
   * appearance picker should be disabled with an offline tooltip.
   */
  serverReachable: boolean;

  currentFolderId: FolderId | null;
  setCurrentFolderId: (id: FolderId | null) => void;

  breadcrumbs: FolderBreadcrumbEntry[];

  /** Re-read the IDB cache (cheap; for revision-driven refresh). */
  refresh: () => Promise<void>;
  /**
   * Fetch from server, replace the local cache, and bump the revision.
   * Returns the result so the UI can distinguish "endpoint not deployed"
   * from real failures.
   */
  pullFromServer: () => Promise<{
    ok: boolean;
    reason?: "endpoint-missing" | "network" | "server" | "client";
  }>;
  createFolder: (
    name: string,
    parentFolderId?: FolderId | null,
  ) => Promise<FolderRecord>;
  renameFolder: (id: FolderId, name: string) => Promise<FolderRecord | null>;
  moveFolder: (
    id: FolderId,
    newParentId: FolderId | null,
  ) => Promise<FolderRecord | null>;
  updateFolderAppearance: (
    id: FolderId,
    appearance: { color?: string; icon?: string | null },
  ) => Promise<FolderRecord | null>;
  deleteFolder: (id: FolderId) => Promise<FolderId[]>;

  getChildFolderIds: (parentId: FolderId | null) => FolderId[];
  isDescendant: (candidateId: FolderId, ancestorId: FolderId | null) => boolean;
}

const FolderContext = createContext<FolderContextValue | null>(null);

interface FolderProviderProps {
  children: React.ReactNode;
}

function buildTree(folders: FolderRecord[]): FolderTreeNode[] {
  const byParent = new Map<FolderId | null, FolderRecord[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentFolderId) ?? [];
    list.push(folder);
    byParent.set(folder.parentFolderId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }
  const build = (
    parentId: FolderId | null,
    depth: number,
  ): FolderTreeNode[] => {
    const direct = byParent.get(parentId) ?? [];
    return direct.map((folder) => ({
      folder,
      depth,
      children: build(folder.id, depth + 1),
    }));
  };
  return build(ROOT_FOLDER_ID, 0);
}

/** Convert a server-side error to a banner-ready user message. */
function formatServerError(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (
      err as {
        response?: {
          status?: number;
          data?: {
            message?: string;
            error?: string;
            errors?: { defaultMessage?: string }[];
          };
        };
      }
    ).response;
    const status = response?.status;
    const msg =
      response?.data?.message ??
      response?.data?.error ??
      response?.data?.errors?.[0]?.defaultMessage;
    if (msg) return status ? `${msg} (HTTP ${status})` : msg;
  }
  return err instanceof Error ? err.message : "Folder operation failed";
}

/**
 * Classify an error's reachability signal. 5xx and "no status" (network) mean
 * the server is *not* reachable; 4xx means the server answered (just rejected
 * our request). Used to update {@link serverReachable} from mutation paths.
 */
function reachabilityFromError(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status !== undefined && status >= 400 && status < 500;
}

export function FolderProvider({ children }: FolderProviderProps) {
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Start `false` so folder-mutation buttons are disabled until the first
  // pullFromServer proves the backend is up. Starting `true` would let users
  // click "New folder" during the gap, then see a banner error after they
  // submitted the dialog.
  const [serverReachable, setServerReachable] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<FolderId | null>(
    ROOT_FOLDER_ID,
  );
  // Tick when folder state changes so consumers re-read.
  const [folderRevision, setFolderRevision] = useState(0);
  const bumpFolderRevision = useCallback(() => {
    setFolderRevision((r) => r + 1);
  }, []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await folderStorage.getAllFolders();
      if (!mountedRef.current) return;
      setFolders(all);
    } catch (err) {
      console.error("[FolderContext] cache read failed", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, folderRevision]);

  // Single-flight guard - concurrent pullFromServer calls would race and the
  // last-resolving (often older) response would clobber the newer state.
  type PullResult = {
    ok: boolean;
    reason?: "endpoint-missing" | "network" | "server" | "client";
  };
  const pullInFlight = useRef<Promise<PullResult> | null>(null);

  const pullFromServer = useCallback(async (): Promise<PullResult> => {
    if (pullInFlight.current) return pullInFlight.current;
    const promise: Promise<PullResult> = (async () => {
      let remote: FolderRecord[];
      try {
        remote = await folderSyncService.list();
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status;
        if (status === 404) {
          // Storage backend not deployed in this build - expected for
          // core-only.
          if (mountedRef.current) setServerReachable(false);
          return { ok: false, reason: "endpoint-missing" };
        }
        console.warn("[FolderContext] pullFromServer failed", err);
        if (mountedRef.current) {
          setServerReachable(false);
          setError(`Folder sync failed: ${formatServerError(err)}`);
        }
        // Narrowing the ternary into a typed variable so TS keeps the literal
        // union rather than widening to `string`.
        const reason: PullResult["reason"] =
          status && status >= 500 ? "server" : status ? "client" : "network";
        return { ok: false, reason };
      }

      // Server-wins: cache becomes a verbatim copy of what the server
      // returned. A folder absent from the response was deleted server-side;
      // replaceAll drops it from the cache too.
      try {
        await folderStorage.replaceAll(remote);
      } catch (cacheErr) {
        // The server response was good; only the local cache write failed.
        // We still consider this an ok pull - render from in-memory state.
        console.warn("[FolderContext] cache replace failed", cacheErr);
      }
      if (mountedRef.current) {
        setFolders(remote);
        setServerReachable(true);
        setError(null);
      }
      bumpFolderRevision();
      return { ok: true };
    })();
    pullInFlight.current = promise;
    try {
      return await promise;
    } finally {
      pullInFlight.current = null;
    }
  }, [bumpFolderRevision]);

  // Pull from server on mount - the IDB cache is for instant paint only;
  // we always reconcile with the server before letting the user mutate.
  useEffect(() => {
    void pullFromServer();
  }, [pullFromServer]);

  const foldersById = useMemo(() => {
    const map = new Map<FolderId, FolderRecord>();
    for (const folder of folders) map.set(folder.id, folder);
    return map;
  }, [folders]);

  const tree = useMemo(() => buildTree(folders), [folders]);

  const breadcrumbs = useMemo<FolderBreadcrumbEntry[]>(() => {
    // Root name is a placeholder - consumers should detect
    // `entry.id === ROOT_FOLDER_ID` and substitute their own translated label.
    const path: FolderBreadcrumbEntry[] = [
      { id: ROOT_FOLDER_ID, name: "All files" },
    ];
    if (currentFolderId === null) return path;
    const chain: FolderRecord[] = [];
    let cursor: FolderId | null = currentFolderId;
    const seen = new Set<FolderId>();
    while (cursor !== null) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const folder = foldersById.get(cursor);
      if (!folder) break;
      chain.unshift(folder);
      cursor = folder.parentFolderId;
    }
    for (const folder of chain) {
      path.push({ id: folder.id, name: folder.name });
    }
    return path;
  }, [currentFolderId, foldersById]);

  const getChildFolderIds = useCallback(
    (parentId: FolderId | null): FolderId[] =>
      folders.filter((f) => f.parentFolderId === parentId).map((f) => f.id),
    [folders],
  );

  const isDescendant = useCallback(
    (candidateId: FolderId, ancestorId: FolderId | null): boolean => {
      if (ancestorId === null) return true;
      let cursor: FolderId | null = candidateId;
      const seen = new Set<FolderId>();
      while (cursor !== null) {
        if (cursor === ancestorId) return true;
        if (seen.has(cursor)) return false;
        seen.add(cursor);
        cursor = foldersById.get(cursor)?.parentFolderId ?? null;
      }
      return false;
    },
    [foldersById],
  );

  // ─── mutations: server-first, cache update on success ──────────────

  /**
   * Centralised mutation wrapper:
   *   1. Calls the server op.
   *   2. On success: flips `serverReachable=true`, updates in-memory state
   *      from the server response, then best-effort writes the cache (cache
   *      failure does NOT roll back; the in-memory truth came from the server).
   *   3. On failure: updates `serverReachable` per the error class, surfaces
   *      via {@link setError}, re-throws so the caller's dialog can stay open.
   */
  const runFolderMutation = useCallback(
    async <T,>(
      serverOp: () => Promise<T>,
      onSuccess: (result: T) => void | Promise<void>,
    ): Promise<T> => {
      let result: T;
      try {
        result = await serverOp();
      } catch (err) {
        if (mountedRef.current) {
          setServerReachable(reachabilityFromError(err));
          setError(formatServerError(err));
        }
        throw err;
      }
      if (mountedRef.current) {
        setServerReachable(true);
        setError(null);
      }
      try {
        await onSuccess(result);
      } catch (cacheErr) {
        // The server is authoritative - a cache write failure must not be
        // surfaced as if the operation failed. Log + leave the in-memory
        // state authoritative; next pullFromServer will re-seed the cache.
        console.warn(
          "[FolderContext] cache update failed after successful mutation",
          cacheErr,
        );
      }
      bumpFolderRevision();
      return result;
    },
    [bumpFolderRevision],
  );

  const createFolder = useCallback(
    async (
      name: string,
      parentFolderId: FolderId | null = currentFolderId,
    ): Promise<FolderRecord> => {
      const color = pickFolderColor(name);
      // Generate id client-side so the server's idempotency check makes
      // retries safe (network blip → second POST returns the same row).
      const id = createFolderId();
      return runFolderMutation(
        () =>
          folderSyncService.create({
            id,
            name,
            parentFolderId,
            color,
          }),
        async (record) => {
          setFolders((prev) => [
            ...prev.filter((f) => f.id !== record.id),
            record,
          ]);
          await folderStorage.upsertFolder(record);
        },
      );
    },
    [currentFolderId, runFolderMutation],
  );

  const renameFolder = useCallback(
    async (id: FolderId, name: string) => {
      return runFolderMutation(
        () => folderSyncService.update(id, { name }),
        async (record) => {
          setFolders((prev) =>
            prev.map((f) => (f.id === record.id ? record : f)),
          );
          await folderStorage.upsertFolder(record);
        },
      );
    },
    [runFolderMutation],
  );

  const moveFolder = useCallback(
    async (id: FolderId, newParentId: FolderId | null) => {
      return runFolderMutation(
        () =>
          folderSyncService.update(id, {
            reparent: true,
            parentFolderId: newParentId,
          }),
        async (record) => {
          setFolders((prev) =>
            prev.map((f) => (f.id === record.id ? record : f)),
          );
          await folderStorage.upsertFolder(record);
        },
      );
    },
    [runFolderMutation],
  );

  const updateFolderAppearance = useCallback(
    async (
      id: FolderId,
      appearance: { color?: string; icon?: string | null },
    ) => {
      return runFolderMutation(
        () =>
          folderSyncService.update(id, {
            color: appearance.color,
            icon: appearance.icon,
          }),
        async (record) => {
          setFolders((prev) =>
            prev.map((f) => (f.id === record.id ? record : f)),
          );
          await folderStorage.upsertFolder(record);
        },
      );
    },
    [runFolderMutation],
  );

  const { clearFolderForFiles } = useIndexedDB();

  const deleteFolder = useCallback(
    async (id: FolderId): Promise<FolderId[]> => {
      // Custom path (not runFolderMutation) because we have two best-effort
      // cleanups to coordinate, and need to reset currentFolderId BEFORE the
      // cleanups so the user isn't stranded inside a tombstone if the cache
      // write fails.
      let removed: FolderId[];
      try {
        removed = await folderSyncService.delete(id);
      } catch (err) {
        if (mountedRef.current) {
          setServerReachable(reachabilityFromError(err));
          setError(formatServerError(err));
        }
        throw err;
      }
      const removedSet = new Set(removed);
      if (mountedRef.current) {
        setServerReachable(true);
        setError(null);
        setFolders((prev) => prev.filter((f) => !removedSet.has(f.id)));
        if (currentFolderId && removedSet.has(currentFolderId)) {
          setCurrentFolderId(ROOT_FOLDER_ID);
        }
      }
      bumpFolderRevision();
      // Belt-and-braces local cleanup; either failure shouldn't undo the
      // server delete or block the second cleanup.
      const [cacheResult, filesResult] = await Promise.allSettled([
        folderStorage.removeFolders(removed),
        clearFolderForFiles(removed),
      ]);
      if (cacheResult.status === "rejected") {
        console.warn(
          "[FolderContext] folder cache cleanup failed after server delete",
          cacheResult.reason,
        );
      }
      if (filesResult.status === "rejected") {
        console.warn(
          "[FolderContext] file folderId cleanup failed after server delete",
          filesResult.reason,
        );
        if (mountedRef.current) {
          setError(
            "Folder was deleted, but some files couldn't be detached locally. Refresh to fix.",
          );
        }
      }
      return removed;
    },
    [bumpFolderRevision, clearFolderForFiles, currentFolderId],
  );

  const value = useMemo<FolderContextValue>(
    () => ({
      folders,
      foldersById,
      tree,
      loading,
      error,
      setError,
      serverReachable,
      currentFolderId,
      setCurrentFolderId,
      breadcrumbs,
      refresh,
      pullFromServer,
      createFolder,
      renameFolder,
      moveFolder,
      updateFolderAppearance,
      deleteFolder,
      getChildFolderIds,
      isDescendant,
    }),
    [
      folders,
      foldersById,
      tree,
      loading,
      error,
      serverReachable,
      currentFolderId,
      breadcrumbs,
      refresh,
      pullFromServer,
      createFolder,
      renameFolder,
      moveFolder,
      updateFolderAppearance,
      deleteFolder,
      getChildFolderIds,
      isDescendant,
    ],
  );

  return (
    <FolderContext.Provider value={value}>{children}</FolderContext.Provider>
  );
}

export function useFolders(): FolderContextValue {
  const ctx = useContext(FolderContext);
  if (!ctx) {
    throw new Error("useFolders must be used within a FolderProvider");
  }
  return ctx;
}

/** Optional version - returns null when used outside the provider. */
export function useOptionalFolders(): FolderContextValue | null {
  return useContext(FolderContext);
}
