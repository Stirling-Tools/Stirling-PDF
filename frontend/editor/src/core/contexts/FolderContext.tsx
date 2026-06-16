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
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";
import { useLocation } from "react-router-dom";
import { isAuthRoute } from "@app/constants/routes";

interface FolderContextValue {
  folders: FolderRecord[];
  foldersById: Map<FolderId, FolderRecord>;
  tree: FolderTreeNode[];
  loading: boolean;
  error: string | null;
  /** Push a user-visible error string to the banner; null clears it. */
  setError: (msg: string | null) => void;

  /**
   * Whether the most recent folder-API round-trip succeeded. Used to gate
   * folder mutation controls - when false, "New folder", rename, move,
   * delete, and appearance picker should be disabled.
   *
   * Initial value is `false` (fail-closed). Consumers will see a brief
   * window of disabled controls during the first pullFromServer call;
   * starting `true` would cause the inverse flash (enabled controls that
   * the user can click before the first response arrives, then a banner
   * after they submit the dialog), which is the worse failure mode.
   *
   * Naming caveat: the flag flips false for ANY failure mode, not just
   * literal network unreachability. A 401 (not signed in) or 403 (storage
   * disabled on the server) also flips it false - in both cases the user
   * cannot mutate server-side folders, so the disabled UX is correct, but
   * the tooltip wording should avoid claiming the user is "offline"
   * (they may not be). The shared i18n key `filesPage.offlineNoFolderEdits`
   * has been worded to cover all three cases.
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
  // Cap recursion. Backend cycle detection + per-user folder cap already
  // prevent legitimately-deep chains, so any chain past this limit means
  // either a corrupted local cache or a malicious server response. Bail
  // out at the depth boundary so the JS call stack stays finite either
  // way; the user just sees the tree truncated at the bad node.
  const MAX_BUILD_DEPTH = 50;
  const build = (
    parentId: FolderId | null,
    depth: number,
  ): FolderTreeNode[] => {
    if (depth >= MAX_BUILD_DEPTH) return [];
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

/** Root + every local descendant via parentFolderId. Bounded for corrupted chains. */
function collectLocalSubtreeIds(
  rootId: FolderId,
  folders: FolderRecord[],
): Set<FolderId> {
  const childrenByParent = new Map<FolderId, FolderId[]>();
  for (const f of folders) {
    if (f.parentFolderId === null) continue;
    const list = childrenByParent.get(f.parentFolderId) ?? [];
    list.push(f.id);
    childrenByParent.set(f.parentFolderId, list);
  }
  const result = new Set<FolderId>([rootId]);
  const stack: FolderId[] = [rootId];
  const MAX_LOCAL_SUBTREE_NODES = 10_000;
  while (stack.length > 0 && result.size < MAX_LOCAL_SUBTREE_NODES) {
    const cur = stack.pop()!;
    const children = childrenByParent.get(cur);
    if (!children) continue;
    for (const childId of children) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}

/** Extract HTTP status off an axios-style error, or undefined on network failure. */
function errorStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/**
 * True if `currentId` or any of its ancestors is in `removedSet`. Walks up via
 * `parentFolderId` using the pre-removal `folders` snapshot so the chain is
 * still discoverable while the cascade is in flight. Used to force-reset
 * currentFolderId when the user was browsing a folder whose ancestor just
 * got deleted (otherwise the UI strands them on a folder id that no longer
 * exists on the server).
 */
function shouldStrandedReset(
  currentId: FolderId,
  removedSet: Set<FolderId>,
  folders: FolderRecord[],
): boolean {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cursor: FolderId | null = currentId;
  // Bounded walk: max 50 levels matches the existing depth guard elsewhere
  // and protects against malformed parent cycles.
  for (let i = 0; i < 50 && cursor; i++) {
    if (removedSet.has(cursor)) return true;
    const node = byId.get(cursor);
    cursor = (node?.parentFolderId ?? null) as FolderId | null;
  }
  return false;
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
        if (mountedRef.current) {
          setServerReachable(false);
          // Only surface a banner when this is a server-side outage or
          // network glitch the user can act on. 4xx responses are
          // configuration / auth signals - the deployment chose to disable
          // storage (403 "Storage is disabled") or the user simply isn't
          // logged in yet (401) - in both cases the "Folder sync failed"
          // banner is noise the user can't fix from inside the file
          // manager. Folder-mutation buttons get individual disabled
          // tooltips via `serverReachable`, which is enough signal.
          if (status === undefined || status >= 500) {
            console.warn("[FolderContext] pullFromServer failed", err);
            setError(`Folder sync failed: ${formatServerError(err)}`);
          }
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
  // Short-circuit when AppConfig already tells us storage is off (desktop,
  // login disabled, or `storage.enabled=false`). The server-side
  // ConfigController computes `storageEnabled = enableLogin && storage.isEnabled`
  // so this single check covers all three failure modes - saves one
  // guaranteed-to-403 round-trip per session.
  const { config: appConfig } = useAppConfig();
  const storageBackedByServer = appConfig?.storageEnabled === true;
  // Skip server pulls on auth routes: FolderProvider is mounted globally and
  // /login has no session yet, so the pull would be a guaranteed 401.
  const location = useLocation();
  const onAuthRoute = isAuthRoute(location.pathname);
  // Guests (anonymous sessions) have no server-side storage, so a pull is a
  // guaranteed 401 - skip it once we know the session is anonymous. This is
  // what keeps the "must sign in" affordance toast-free: with no folder request
  // fired, there's no error to surface. We gate on `isAnonymous` (which is
  // false for a real signed-in user) rather than the auth `loading` flag, which
  // can stay true for an authenticated session and would otherwise block the
  // pull for legitimate users.
  const { user, isAnonymous } = useAuth();
  useEffect(() => {
    // Only pull once we have a confirmed, non-anonymous user. Skipping while
    // `user` is still null avoids a stray 401 in the brief window before an
    // anonymous session resolves (at which point `isAnonymous` flips true and
    // keeps us out). `isAnonymous` alone isn't enough because it defaults false
    // before the session loads; the auth `loading` flag is unreliable (it can
    // stay true for a valid signed-in session), so we key off the user object.
    if (!storageBackedByServer || onAuthRoute || !user || isAnonymous) return;
    void pullFromServer();
  }, [pullFromServer, storageBackedByServer, onAuthRoute, user, isAnonymous]);

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

  // Lifted up so handleStaleFolder below can reuse the file-detach primitive.
  const { clearFolderForFiles } = useIndexedDB();

  /** Treat a per-folder 404 as "deleted elsewhere": drop subtree, strand-reset, pull. */
  const handleStaleFolder = useCallback(
    (staleId: FolderId, foldersSnapshot: FolderRecord[]) => {
      const subtree = collectLocalSubtreeIds(staleId, foldersSnapshot);
      if (mountedRef.current) {
        setServerReachable(true);
        setError(null);
        setFolders((prev) => prev.filter((f) => !subtree.has(f.id)));
        if (
          currentFolderId !== null &&
          shouldStrandedReset(currentFolderId, subtree, foldersSnapshot)
        ) {
          setCurrentFolderId(ROOT_FOLDER_ID);
        }
      }
      const subtreeIds = [...subtree];
      // Best-effort - pullFromServer is authoritative if these miss.
      void folderStorage
        .removeFolders(subtreeIds)
        .catch((e) => console.warn("[FolderContext] stale cache cleanup", e));
      void clearFolderForFiles(subtreeIds).catch((e) =>
        console.warn("[FolderContext] stale file-folder cleanup", e),
      );
      bumpFolderRevision();
      void pullFromServer();
    },
    [bumpFolderRevision, clearFolderForFiles, currentFolderId, pullFromServer],
  );

  /**
   * Server-first mutation wrapper. On 404 with `staleFolderId`, hands off to
   * handleStaleFolder and resolves `null`; other errors surface + re-throw.
   */
  const runFolderMutation = useCallback(
    async <T,>(
      serverOp: () => Promise<T>,
      onSuccess: (result: T) => void | Promise<void>,
      staleFolderId: FolderId | null = null,
    ): Promise<T | null> => {
      let result: T;
      try {
        result = await serverOp();
      } catch (err) {
        if (errorStatus(err) === 404 && staleFolderId !== null) {
          // `folders` is a closure snapshot; functional setFolders + the pull
          // keep this race-safe even if a concurrent mutation shifted state.
          handleStaleFolder(staleFolderId, folders);
          return null;
        }
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
        // Cache write failure is non-fatal; next pull re-seeds.
        console.warn("[FolderContext] cache update after mutation", cacheErr);
      }
      bumpFolderRevision();
      return result;
    },
    [bumpFolderRevision, folders, handleStaleFolder],
  );

  const createFolder = useCallback(
    async (
      name: string,
      parentFolderId: FolderId | null = currentFolderId,
    ): Promise<FolderRecord> => {
      const color = pickFolderColor(name);
      // Client-side id makes server idempotency check safe on retry.
      const id = createFolderId();
      const result = await runFolderMutation(
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
      // No staleFolderId passed → null branch can't fire; defensive throw.
      if (result === null) {
        throw new Error("createFolder unexpectedly returned null");
      }
      return result;
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
        id,
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
        id,
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
        id,
      );
    },
    [runFolderMutation],
  );

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
        if (errorStatus(err) === 404) {
          // Already gone; treat as success. Return [id]; pull is authoritative.
          handleStaleFolder(id, folders);
          return [id];
        }
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
        // Reset if EITHER the current folder OR any ancestor was deleted.
        // Walking by parentFolderId catches the "user is browsing /a/b/c and
        // we just deleted /a" case where the exact-id check would leave the
        // UI pointing at /c which no longer exists.
        if (
          currentFolderId &&
          shouldStrandedReset(currentFolderId, removedSet, folders)
        ) {
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
    [
      bumpFolderRevision,
      clearFolderForFiles,
      currentFolderId,
      folders,
      handleStaleFolder,
    ],
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
