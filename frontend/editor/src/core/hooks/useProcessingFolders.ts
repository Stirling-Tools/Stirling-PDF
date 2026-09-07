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

/** The editable heart of a processing record: identity, liveness, steps. */
export interface ProcessingRecordSummary {
  id: string;
  enabled: boolean;
  steps: {
    operation: string;
    parameters: Record<string, unknown>;
    assets?: Record<string, unknown>;
  }[];
}

/** One file in a working folder, with its place in the pipeline. */
export interface MountedFileState {
  name: string;
  state: "done" | "processing" | "failed" | "waiting";
  /** Whether a pre-processing original is archived and can be restored. */
  hasOriginal?: boolean;
}

export interface ProcessingFoldersApi {
  /** The folder's processing state; undefined means an ordinary folder. */
  stateFor: (folder: FolderRecord) => ProcessingFolderState | undefined;
  /** The folder's processing record, for editing its steps in place. */
  recordFor: (folder: FolderRecord) => ProcessingRecordSummary | undefined;
  /** Server-storage folder ids whose processing is enabled, for id-only callers. */
  enabledFolderIds: ReadonlySet<string>;
  /** Whether any processing folder is enabled, whatever it watches. */
  anyEnabled: boolean;
  /** The record's runs that are currently executing (or queued to). */
  listActiveRuns: (recordId: string) => Promise<ProcessingRunInfo[]>;
  /** The record's files with their per-file pipeline state, whatever it watches. */
  listFiles: (recordId: string) => Promise<MountedFileState[]>;
  /** Retry one failed file now; other parked failures stay parked. */
  retryFile: (recordId: string, name: string) => Promise<void>;
  /** Restore a file's original: pauses the folder; the file reads as waiting. */
  revertFile: (recordId: string, name: string) => Promise<void>;
  /** Restore every archived original: pauses the folder; mid-run files skip.
   *  Reports counts so a no-op (nothing archived) can say so. */
  revertAll: (
    folder: FolderRecord,
  ) => Promise<{ restored: number; skipped: number } | undefined>;
  /** Attach the default (classification) pipeline, or resume a paused one. */
  enable: (folder: FolderRecord) => Promise<void>;
  /** Pause processing; the pair and its processed-history stay, so resuming
   *  never re-runs what was already done. */
  disable: (folder: FolderRecord) => Promise<void>;
  /** Remove the processing behaviour and its history; the folder and files stay. */
  remove: (folder: FolderRecord) => Promise<void>;
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
    recordFor: () => undefined,
    enabledFolderIds: EMPTY_IDS,
    anyEnabled: false,
    listActiveRuns: async () => [],
    listFiles: async () => [],
    retryFile: async () => {},
    revertFile: async () => {},
    revertAll: async () => undefined,
    enable: async () => {},
    disable: async () => {},
    remove: async () => {},
    sweep: async () => {},
  };
}

/** Reload the shared list. No-op in core, which has no processing folders. */
export function refreshProcessingFolders(): Promise<void> {
  return Promise.resolve();
}
