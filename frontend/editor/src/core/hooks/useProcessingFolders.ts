import type { FolderRecord } from "@app/types/folder";

/** A folder's processing state, as the files page needs to render it. */
export interface ProcessingFolderState {
  /** The processing record's own id — not the folder's. */
  id: string;
  enabled: boolean;
  /** Where a disk-backed folder's results land, when the record names one. */
  outputDirectory?: string;
}

/** One in-flight run of a processing folder, as the files page shows it. */
export interface ProcessingRunInfo {
  runId: string;
  /** The document being processed, when the run's source recorded a name. */
  fileName: string | null;
  currentStep: number;
  stepCount: number;
}

export interface ProcessingFoldersApi {
  /** The folder's processing state; undefined means an ordinary folder. */
  stateFor: (folder: FolderRecord) => ProcessingFolderState | undefined;
  /** Server-storage folder ids whose processing is enabled, for id-only callers. */
  enabledFolderIds: ReadonlySet<string>;
  /** Whether any processing folder is enabled, whatever it watches. */
  anyEnabled: boolean;
  /** The record's runs that are currently executing (or queued to). */
  listActiveRuns: (recordId: string) => Promise<ProcessingRunInfo[]>;
  /** Attach the default (classification) pipeline to a folder. */
  enable: (folder: FolderRecord) => Promise<void>;
  /** Remove the processing behaviour; the folder and its files stay. */
  disable: (folder: FolderRecord) => Promise<void>;
  /** Process the folder's current contents now. */
  sweep: (folder: FolderRecord) => Promise<void>;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * Processing folders — folders that run a pipeline over anything added to
 * them, whatever kind of folder they are. Inert in core; the proprietary
 * build shadows this with an implementation backed by
 * `/api/v1/processing-folders`.
 */
export function useProcessingFolders(): ProcessingFoldersApi {
  return {
    stateFor: () => undefined,
    enabledFolderIds: EMPTY_IDS,
    anyEnabled: false,
    listActiveRuns: async () => [],
    enable: async () => {},
    disable: async () => {},
    sweep: async () => {},
  };
}

/** Reload the shared list. No-op in core, which has no processing folders. */
export function refreshProcessingFolders(): Promise<void> {
  return Promise.resolve();
}
