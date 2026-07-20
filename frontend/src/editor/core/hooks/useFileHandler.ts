import { useCallback } from "react";
import { useFileActions } from "@editor/contexts/FileContext";
import type { StirlingFile } from "@editor/types/fileContext";

export const useFileHandler = () => {
  const { actions } = useFileActions();

  const addFiles = useCallback(
    async (
      files: File[],
      options: {
        insertAfterPageId?: string;
        selectFiles?: boolean;
        /** Persist to IDB without dispatching to workspace state. */
        skipWorkspaceDispatch?: boolean;
      } = {},
    ): Promise<StirlingFile[]> => {
      // Merge default options with passed options - passed options take precedence
      const mergedOptions = { selectFiles: true, ...options };
      // Let FileContext handle deduplication with quickKey logic
      const result = await actions.addFiles(files, mergedOptions);
      return result;
    },
    [actions.addFiles],
  );

  return {
    addFiles,
  };
};
