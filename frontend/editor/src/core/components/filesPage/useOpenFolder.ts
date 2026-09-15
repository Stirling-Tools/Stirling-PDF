import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import type { FolderId } from "@app/types/folder";

/**
 * Open a folder by putting it in the URL, which is what selects it: the library reads
 * its current folder back out of the path. Selecting the folder state directly leaves
 * the path to an effect that cannot tell such a selection from one the path itself
 * made, which is why this is the only way in.
 */
export function useOpenFolder(): (id: FolderId | null) => void {
  const navigate = useNavigate();
  return useCallback(
    (id: FolderId | null) => {
      navigate(id === null ? "/files" : `/files/${id}`);
    },
    [navigate],
  );
}
