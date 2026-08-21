import { useCallback } from "react";
import { useFileActions } from "@app/contexts/FileContext";
import type { StirlingFile } from "@app/types/fileContext";

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
        /** Defaults to true; false keeps an archive intact (e.g. duplicating one). */
        autoUnzip?: boolean;
        /** Skip the upload metric - the file isn't new to the system (e.g. a copy). */
        skipUploadTracking?: boolean;
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
