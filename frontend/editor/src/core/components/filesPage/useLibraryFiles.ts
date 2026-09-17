import { useEffect, useMemo } from "react";
import { useFolders } from "@app/contexts/FolderContext";
import type {
  FilesPageOriginFilter,
  FilesPageSortMode,
  FilesPageTab,
} from "@app/contexts/FilesPageContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import { FolderId, folderKind } from "@app/types/folder";
import type { DiskFileEntry } from "@app/services/localFolderContents";
import { getFileOrigin } from "@app/components/filesPage/fileOrigin";

export interface LibraryFilters {
  currentFolderId: FolderId | null;
  currentTab: FilesPageTab;
  search: string;
  sortMode: FilesPageSortMode;
  originFilter: FilesPageOriginFilter;
  typeFilter: string[];
  setTypeFilter: (value: string[]) => void;
}

/** Shares folder scoping, filtering and ordering without owning navigation or selection. */
export function useLibraryFiles({
  allFiles,
  currentFolderId,
  currentTab,
  search,
  sortMode,
  originFilter,
  typeFilter,
  setTypeFilter,
  diskEntries,
}: LibraryFilters & {
  allFiles: StirlingFileStub[];
  diskEntries?: DiskFileEntry[];
}) {
  const { folders: folderRecords, foldersById } = useFolders();
  /** currentFolderId + all descendants. Includes `null` when at root. */
  const subtreeFolderIds = useMemo(() => {
    const set = new Set<FolderId | null>();
    set.add(currentFolderId);
    const childMap = new Map<FolderId | null, FolderId[]>();
    for (const f of folderRecords) {
      const list = childMap.get(f.parentFolderId) ?? [];
      list.push(f.id);
      childMap.set(f.parentFolderId, list);
    }
    const stack: (FolderId | null)[] = [currentFolderId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const childId of childMap.get(cur) ?? []) {
        if (set.has(childId)) continue;
        set.add(childId);
        stack.push(childId);
      }
    }
    return set;
  }, [folderRecords, currentFolderId]);

  const visibleFolders = useMemo(() => {
    if (
      currentTab === "recent" ||
      currentTab === "shared" ||
      currentTab === "sharedByMe"
    ) {
      return [];
    }
    const lc = search.toLowerCase();
    const matched = folderRecords.filter((f) => {
      if (currentTab === "cloud" && folderKind(f) !== "server") return false;
      if (originFilter !== "all") {
        const folderOrigin = folderKind(f) === "server" ? "cloud" : "local";
        if (folderOrigin !== originFilter) return false;
      }
      if (search) {
        return (
          f.id !== currentFolderId &&
          subtreeFolderIds.has(f.parentFolderId) &&
          f.name.toLowerCase().includes(lc)
        );
      }
      return f.parentFolderId === currentFolderId;
    });
    return matched.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [
    folderRecords,
    currentFolderId,
    search,
    currentTab,
    subtreeFolderIds,
    originFilter,
  ]);
  const filesInCurrentFolder = useMemo(() => {
    switch (currentTab) {
      case "cloud":
        return allFiles.filter((f) => {
          if (f.remoteStorageId == null) return false;
          if (search) return subtreeFolderIds.has(f.folderId ?? null);
          return (f.folderId ?? null) === (currentFolderId ?? null);
        });
      case "recent": {
        const sorted = [...allFiles].sort(
          (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
        );
        // Searching Recent must still find older files anywhere in the library.
        return search ? sorted : sorted.slice(0, 50);
      }
      case "shared":
        return allFiles.filter((f) => f.remoteOwnedByCurrentUser === false);
      case "sharedByMe":
        return allFiles.filter(
          (f) =>
            f.remoteOwnedByCurrentUser !== false &&
            (f.remoteHasShareLinks === true || f.remoteHasUserShares === true),
        );
      case "all":
      default:
        return allFiles.filter((f) => {
          const rawFolder = f.folderId ?? null;
          const effectiveFolder =
            rawFolder !== null && !foldersById.has(rawFolder)
              ? null
              : rawFolder;
          if (search) return subtreeFolderIds.has(effectiveFolder);
          return effectiveFolder === (currentFolderId ?? null);
        });
    }
  }, [
    allFiles,
    currentFolderId,
    currentTab,
    search,
    subtreeFolderIds,
    foldersById,
  ]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const f of diskEntries ?? filesInCurrentFolder) {
      const ext = (f.name.split(".").pop() ?? "").toUpperCase();
      if (ext) set.add(ext);
    }
    return Array.from(set).sort();
  }, [filesInCurrentFolder, diskEntries]);
  useEffect(() => {
    if (typeFilter.length === 0) return;
    const stillValid = typeFilter.filter((t) => availableTypes.includes(t));
    if (stillValid.length !== typeFilter.length) {
      setTypeFilter(stillValid);
    }
  }, [availableTypes, typeFilter, setTypeFilter]);

  const visibleFiles = useMemo(() => {
    const filtered = filesInCurrentFolder
      .filter((f) =>
        search ? f.name.toLowerCase().includes(search.toLowerCase()) : true,
      )
      .filter((f) =>
        originFilter === "all" ? true : getFileOrigin(f) === originFilter,
      )
      .filter((f) => {
        if (typeFilter.length === 0) return true;
        const ext = (f.name.split(".").pop() ?? "").toUpperCase();
        return typeFilter.includes(ext);
      });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortMode) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "modified-asc":
          return (a.lastModified ?? 0) - (b.lastModified ?? 0);
        case "size-desc":
          return (b.size ?? 0) - (a.size ?? 0);
        case "size-asc":
          return (a.size ?? 0) - (b.size ?? 0);
        case "modified-desc":
        default:
          return (b.lastModified ?? 0) - (a.lastModified ?? 0);
      }
    });
    return sorted;
  }, [filesInCurrentFolder, search, sortMode, originFilter, typeFilter]);

  return { visibleFolders, visibleFiles, availableTypes };
}
