import { FileId } from "@app/types/file";
import { FolderId } from "@app/types/folder";

/**
 * Custom MIME used to flag drag operations originating inside the
 * file manager page. Using a custom type avoids clashing with native
 * file/text drags from the OS.
 */
export const FILES_PAGE_DRAG_TYPE = "application/x-stirling-files-page";

export type FilesPageDragPayload =
  | { kind: "files"; fileIds: FileId[] }
  | { kind: "folder"; folderId: FolderId };

export function serialiseFilesPageDragPayload(
  payload: FilesPageDragPayload,
): string {
  return JSON.stringify(payload);
}

export function parseFilesPageDragPayload(
  dataTransfer: DataTransfer,
): FilesPageDragPayload | null {
  if (!dataTransfer.types.includes(FILES_PAGE_DRAG_TYPE)) return null;
  const raw = dataTransfer.getData(FILES_PAGE_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FilesPageDragPayload;
    if (parsed.kind === "files" && Array.isArray(parsed.fileIds)) {
      return parsed;
    }
    if (parsed.kind === "folder" && typeof parsed.folderId === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
