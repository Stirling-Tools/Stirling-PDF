import { useMemo, useRef } from 'react';
import { FileId } from '@app/types/file';

/**
 * Maintains stable color assignments for a collection of file IDs.
 * Colors are assigned by insertion order and preserved across reorders.
 */
export function useFileColorMap(fileIds: FileId[]): Map<FileId, number> {
  const assignmentsRef = useRef(new Map<FileId, number>());

  const serializedIds = useMemo(() => fileIds.join(','), [fileIds]);

  return useMemo(() => {
    const assignments = assignmentsRef.current;
    const activeIds = new Set(fileIds);

    // Remove colors for files that no longer exist
    for (const id of Array.from(assignments.keys())) {
      if (!activeIds.has(id)) {
        assignments.delete(id);
      }
    }

    // Assign colors to any new files
    fileIds.forEach((id) => {
      if (!assignments.has(id)) {
        assignments.set(id, assignments.size);
      }
    });

    return assignments;
  }, [serializedIds, fileIds]);
}
