/** A folder's processing state, as the files page needs to render it. */
export interface ProcessingFolderState {
  id: string;
  enabled: boolean;
  /** Set when the folder is mounted from a directory on disk rather than app storage. */
  directory?: string | null;
  /** Display name, for a mounted folder that has no storage folder to take a name from. */
  name?: string;
}

export interface ProcessingFoldersApi {
  /** Processing state per storage folder id; absent means an ordinary folder. */
  byFolderId: Map<string, ProcessingFolderState>;
  /** Disk-backed processing folders, which the file manager shows as mounted folders. */
  mounted: ProcessingFolderState[];
  /** Attach the default (classification) pipeline to a folder. */
  enable: (folderId: string) => Promise<void>;
  /** Remove the processing behaviour; the folder and its files stay. */
  disable: (folderId: string) => Promise<void>;
  /** Process the folder's current contents now. */
  sweep: (folderId: string) => Promise<void>;
}

/**
 * Processing folders — folders that run a pipeline over anything added to them.
 * Inert in core; the proprietary build shadows this with an implementation
 * backed by `/api/v1/processing-folders`.
 */
export function useProcessingFolders(): ProcessingFoldersApi {
  return {
    byFolderId: new Map(),
    mounted: [],
    enable: async () => {},
    disable: async () => {},
    sweep: async () => {},
  };
}

/** Reload the shared list. No-op in core, which has no processing folders. */
export function refreshProcessingFolders(): Promise<void> {
  return Promise.resolve();
}
