import { FileId } from "@app/types/fileContext";

/**
 * Reorders a list of file IDs when moving `sourceId` onto `targetId`.
 *
 * Rules:
 * - If `sourceId` is part of `selectedIds`, the entire selected group is moved together,
 *   preserving their current visual relative order in `currentIds`.
 * - If `sourceId` is not in `selectedIds`, only `sourceId` is moved.
 * - Dropping onto any member of the moving group is a no-op.
 * - Missing `sourceId` or `targetId` is a no-op.
 * - Returns original array reference if the order is unchanged.
 */
export function reorderFileIds(
  currentIds: FileId[],
  sourceId: FileId,
  targetId: FileId,
  selectedIds: readonly FileId[],
): FileId[] {
  const sourceIndex = currentIds.indexOf(sourceId);
  const targetIndex = currentIds.indexOf(targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceId === targetId) {
    return currentIds;
  }

  const selected = new Set(selectedIds);
  const movingIds = selected.has(sourceId)
    ? currentIds.filter((id) => selected.has(id))
    : [sourceId];

  const moving = new Set(movingIds);
  if (moving.has(targetId)) {
    return currentIds;
  }

  const remaining = currentIds.filter((id) => !moving.has(id));
  const targetPosition = remaining.indexOf(targetId);
  const insertPosition = targetPosition + (sourceIndex < targetIndex ? 1 : 0);

  const nextIds = [
    ...remaining.slice(0, insertPosition),
    ...movingIds,
    ...remaining.slice(insertPosition),
  ];

  return nextIds.every((id, index) => id === currentIds[index])
    ? currentIds
    : nextIds;
}
