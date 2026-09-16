import type { FolderId, FolderRecord } from "@app/types/folder";

/** Root-first chain including the selected folder; stops at missing parents and cycles. */
export function getFolderChain(
  folderId: FolderId | null | undefined,
  foldersById: ReadonlyMap<FolderId, FolderRecord>,
): FolderRecord[] {
  const chain: FolderRecord[] = [];
  const seen = new Set<FolderId>();
  let cursor = folderId;
  while (cursor != null && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = foldersById.get(cursor);
    if (!folder) break;
    chain.unshift(folder);
    cursor = folder.parentFolderId;
  }
  return chain;
}

/** Display path for breadcrumbs and search results; root and unknown ids have no path. */
export function getFolderPath(
  folderId: FolderId | null | undefined,
  foldersById: ReadonlyMap<FolderId, FolderRecord>,
): string {
  return getFolderChain(folderId, foldersById)
    .map((folder) => folder.name)
    .join(" / ");
}
