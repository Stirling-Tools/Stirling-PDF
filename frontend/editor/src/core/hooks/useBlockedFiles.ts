import { useRef } from "react";
import { useFileSelector } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";

/** Subscribes to required-policy failures for the files a surface actually uses. */
export function useBlockedFiles(
  fileIds: readonly (string | null | undefined)[],
): FileId[] {
  const blocks = useFileSelector((state) => state.ui.policyBlocks);
  const previous = useRef<FileId[]>([]);
  const blocked = [...new Set(fileIds)].filter(
    (id): id is FileId => !!id && blocks[id as FileId] !== undefined,
  );
  if (
    blocked.length !== previous.current.length ||
    blocked.some((id, index) => id !== previous.current[index])
  ) {
    previous.current = blocked;
  }
  return previous.current;
}
