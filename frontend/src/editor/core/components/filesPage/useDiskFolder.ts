import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFolders } from "@app/contexts/FolderContext";
import {
  diskFolderId,
  pickFolderColor,
  type FolderId,
} from "@app/types/folder";
import {
  canListDirectory,
  listDirectory,
  type DiskFileEntry,
} from "@app/services/localFolderContents";

/** Reads mounted directories and ignores obsolete replies after navigation. */
export function useDiskFolder(
  currentLocalDirectory: string | undefined,
  currentFolderId: FolderId | null,
  diskRevision: number,
  setFolderError: (message: string) => void,
) {
  const { t } = useTranslation();
  const { registerDiskSubfolders } = useFolders();
  const [diskEntries, setDiskEntries] = useState<DiskFileEntry[]>([]);
  const [diskLoading, setDiskLoading] = useState(false);

  useEffect(() => {
    if (!currentLocalDirectory || !canListDirectory) {
      setDiskEntries((prev) => (prev.length > 0 ? [] : prev));
      setDiskLoading(false);
      return;
    }
    let cancelled = false;
    const load = async (background: boolean) => {
      if (!background) setDiskLoading(true);
      try {
        const listed = await listDirectory(currentLocalDirectory);
        if (cancelled) return;
        const files = listed?.files ?? [];
        setDiskEntries((prev) =>
          listingSignature(prev) === listingSignature(files) ? prev : files,
        );
        if (currentFolderId !== null) {
          registerDiskSubfolders(
            currentFolderId,
            (listed?.directories ?? []).map((dir) => ({
              id: diskFolderId(dir.path),
              kind: "local" as const,
              name: dir.name,
              parentFolderId: currentFolderId,
              directory: dir.path,
              color: pickFolderColor(dir.name),
              createdAt: 0,
              updatedAt: 0,
            })),
          );
        }
      } catch (err) {
        console.warn("[useDiskFolder] disk listing failed", err);
        if (!cancelled && !background) {
          setDiskEntries([]);
          setFolderError(
            err instanceof Error
              ? t("filesPage.error.readFolderFailedDetail", {
                  message: err.message,
                  defaultValue: `Could not read the folder: ${err.message}`,
                })
              : t(
                  "filesPage.error.readFolderFailed",
                  "Could not read the folder.",
                ),
          );
        }
      } finally {
        if (!cancelled && !background) setDiskLoading(false);
      }
    };
    void load(false);
    const timer = setInterval(() => void load(true), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    currentLocalDirectory,
    currentFolderId,
    registerDiskSubfolders,
    setFolderError,
    diskRevision,
    t,
  ]);

  return { diskEntries, diskLoading };
}

function listingSignature(
  files: { path: string; sizeBytes: number; lastModified: number }[],
): string {
  return files
    .map((file) => `${file.path}|${file.sizeBytes}|${file.lastModified}`)
    .join("\n");
}
