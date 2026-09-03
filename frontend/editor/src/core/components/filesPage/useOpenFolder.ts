import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import type { FolderId } from "@app/types/folder";

/**
 * Open a folder by putting it in the URL, which is what selects it: the library
 * reads its current folder back out of the path.
 *
 * Selecting folder state directly instead would leave the path to be caught up by an
 * effect, and that effect cannot tell a selection made here from one the path itself
 * just made - so a click racing a back/forward ends up pushing the folder being left
 * on top of the entry just landed on.
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
