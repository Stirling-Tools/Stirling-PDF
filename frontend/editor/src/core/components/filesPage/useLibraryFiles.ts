import { useMemo } from "react";
import { useFolders } from "@app/contexts/FolderContext";
import type {
  FilesPageOriginFilter,
  FilesPageSortMode,
  FilesPageTab,
} from "@app/contexts/FilesPageContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import { FolderId, folderKind } from "@app/types/folder";
import type { DiskFileEntry } from "@app/services/localFolderContents";
import { libraryFileDate } from "@app/components/filesPage/libraryFileDate";
import {
  getFileOrigin,
  isUnfiledLocalFile,
} from "@app/components/filesPage/fileOrigin";

export interface LibraryFilters {
  currentFolderId: FolderId | null;
  currentTab: FilesPageTab;
  search: string;
  sortMode: FilesPageSortMode;
  originFilter: FilesPageOriginFilter;
  typeFilter: string[];
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
  diskEntries,
  stagedFiles,
}: LibraryFilters & {
  allFiles: StirlingFileStub[];
  diskEntries?: DiskFileEntry[];
  /** Uncommitted imports follow library and Recents filters without belonging to a stored folder. */
  stagedFiles?: StirlingFileStub[];
}) {
  const { folders: folderRecords, foldersById } = useFolders();
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
      case "all":
        return allFiles.filter((f) => {
          if (currentTab === "cloud" && f.remoteStorageId == null) return false;
          const folder = f.folderId ? foldersById.get(f.folderId) : undefined;
          if (isUnfiledLocalFile(f, foldersById)) return false;
          const effectiveFolder =
            folder &&
            ((currentTab !== "cloud" && originFilter !== "cloud") ||
              folderKind(folder) === "server")
              ? folder.id
              : null;
          if (search) return subtreeFolderIds.has(effectiveFolder);
          return effectiveFolder === currentFolderId;
        });
      case "recent":
        return allFiles;
      case "shared":
        return allFiles.filter((f) => f.remoteOwnedByCurrentUser === false);
      case "sharedByMe":
        return allFiles.filter(
          (f) =>
            f.remoteOwnedByCurrentUser !== false &&
            (f.remoteHasShareLinks === true || f.remoteHasUserShares === true),
        );
    }
  }, [
    allFiles,
    currentFolderId,
    currentTab,
    originFilter,
    search,
    subtreeFolderIds,
    foldersById,
  ]);

  const stagedInScope =
    currentTab === "all" || currentTab === "recent" ? stagedFiles : undefined;
  const filesInScope = useMemo(
    () =>
      stagedInScope
        ? [...stagedInScope, ...filesInCurrentFolder]
        : filesInCurrentFolder,
    [stagedInScope, filesInCurrentFolder],
  );

  const availableTypes = useMemo(() => {
    const set = new Set(typeFilter);
    for (const f of diskEntries
      ? [...diskEntries, ...(stagedInScope ?? [])]
      : filesInScope) {
      const lastDot = f.name.lastIndexOf(".");
      const ext = lastDot !== -1 ? f.name.slice(lastDot + 1).toUpperCase() : "";
      if (ext) set.add(ext);
    }
    return Array.from(set).sort();
  }, [filesInScope, diskEntries, stagedInScope, typeFilter]);

  const visibleFiles = useMemo(() => {
    const query = search ? search.toLowerCase() : null;
    const hasTypeFilter = typeFilter.length > 0;
    const typeSet = hasTypeFilter ? new Set(typeFilter) : null;
    const hasOriginFilter = originFilter !== "all";

    const filtered: typeof filesInScope = [];
    for (let i = 0; i < filesInScope.length; i++) {
      const f = filesInScope[i];
      if (query && !f.name.toLowerCase().includes(query)) {
        continue;
      }
      if (hasOriginFilter && getFileOrigin(f) !== originFilter) {
        continue;
      }
      if (typeSet) {
        const lastDot = f.name.lastIndexOf(".");
        const ext =
          lastDot !== -1 ? f.name.slice(lastDot + 1).toUpperCase() : "";
        if (!typeSet.has(ext)) {
          continue;
        }
      }
      filtered.push(f);
    }
    return filtered.sort((a, b) => {
      switch (sortMode) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "modified-asc":
          return (
            libraryFileDate(a, currentTab) - libraryFileDate(b, currentTab)
          );
        case "size-desc":
          return (b.size ?? 0) - (a.size ?? 0);
        case "size-asc":
          return (a.size ?? 0) - (b.size ?? 0);
        case "modified-desc":
        default:
          return (
            libraryFileDate(b, currentTab) - libraryFileDate(a, currentTab)
          );
      }
    });
  }, [filesInScope, search, sortMode, originFilter, typeFilter, currentTab]);

  return { visibleFolders, visibleFiles, availableTypes };
}
