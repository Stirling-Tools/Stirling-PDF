import { FileId } from "@app/types/fileContext";

/**
 * Swaps two file IDs in a list of file IDs.
 *
 * Rules:
 * - Direct pairwise swap: swapping sourceId and targetId only affects those two files.
 * - Dropping onto itself is a no-op and returns the original array reference.
 * - Missing sourceId or targetId is a no-op and returns the original array reference.
 */
export function reorderFileIds(
  currentIds: FileId[],
  sourceId: FileId,
  targetId: FileId,
): FileId[] {
  const sourceIndex = currentIds.indexOf(sourceId);
  const targetIndex = currentIds.indexOf(targetId);

  if (sourceIndex === -1 || targetIndex === -1 || sourceId === targetId) {
    return currentIds;
  }

  const nextIds = [...currentIds];
  nextIds[sourceIndex] = targetId;
  nextIds[targetIndex] = sourceId;

  return nextIds;
}
