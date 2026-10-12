import type { FilesPageEntry } from "@app/components/filesPage/FileGrid";
import type {
  FilesPageSortMode,
  FilesPageOriginFilter,
} from "@app/contexts/FilesPageContext";
import type { DiskFileEntry } from "@app/services/localFolderContents";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FolderId, FolderRecord } from "@app/types/folder";
import { getFolderPath } from "@app/utils/folderPath";

interface Options {
  visibleFiles: StirlingFileStub[];
  visibleFolders: FolderRecord[];
  currentFolderId: FolderId | null;
  foldersById: ReadonlyMap<FolderId, FolderRecord>;
  fileCountsByFolder: ReadonlyMap<FolderId | null, number>;
  search: string;
  sortMode: FilesPageSortMode;
  originFilter: FilesPageOriginFilter;
  typeFilter: string[];
  diskEntries?: DiskFileEntry[];
}

/** diskEntries replaces visibleFiles for mounts; folders always precede files. */
export function libraryEntries({
  visibleFiles,
  visibleFolders,
  currentFolderId,
  foldersById,
  fileCountsByFolder,
  search,
  sortMode,
  diskEntries,
  originFilter,
  typeFilter,
}: Options): FilesPageEntry[] {
  const parentPath = (id: FolderId | null | undefined) =>
    search && (id ?? null) !== currentFolderId
      ? getFolderPath(id, foldersById) || undefined
      : undefined;
  const folders: FilesPageEntry[] = visibleFolders.map((folder) => ({
    kind: "folder",
    folder,
    folderFileCount: diskEntries ? 0 : (fileCountsByFolder.get(folder.id) ?? 0),
    parentPath: parentPath(folder.parentFolderId),
  }));
  const files: FilesPageEntry[] =
    diskEntries !== undefined
      ? diskEntries
          .filter(
            (disk) =>
              (originFilter === "all" || originFilter === "local") &&
              disk.name.toLowerCase().includes(search.toLowerCase()),
          )
          .filter(
            (disk) =>
              !typeFilter.length ||
              typeFilter.includes(
                disk.name.split(".").pop()?.toUpperCase() ?? "",
              ),
          )
          .sort((a, b) => {
            const direction = sortMode.endsWith("asc") ? 1 : -1;
            if (sortMode.startsWith("name"))
              return direction * a.name.localeCompare(b.name);
            if (sortMode.startsWith("size"))
              return direction * (a.sizeBytes - b.sizeBytes);
            return direction * (a.lastModified - b.lastModified);
          })
          .map((disk) => ({ kind: "diskFile", disk }))
      : visibleFiles.map((file) => ({
          kind: "file",
          file,
          parentPath: parentPath(file.folderId),
        }));
  return [...folders, ...files];
}
