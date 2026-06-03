/**
 * Tracks which file ids are currently being dragged toward a Watch Folder.
 *
 * The HTML5 DnD spec hides `dataTransfer` values during `dragover`/`dragenter`
 * (they're only readable on `drop`), so a drop target can't tell *which* file is
 * hovering over it mid-drag. Drag sources publish the ids here on `dragstart`;
 * drop targets read them during `dragover` to give live feedback (e.g. "already
 * in this folder"). Cleared on `dragend`.
 */

let draggedFileIds: string[] = [];

export function setWatchFolderDraggedFileIds(ids: string[]): void {
  draggedFileIds = ids;
}

export function getWatchFolderDraggedFileIds(): string[] {
  return draggedFileIds;
}

export function clearWatchFolderDraggedFileIds(): void {
  draggedFileIds = [];
}
