import type { FolderRecord } from "@app/types/folder";

export interface ProcessingFolderState {
  /** The processing record's own id — not the folder's. */
  id: string;
  enabled: boolean;
  /** Where a disk-backed folder's results land, when the record names one. */
  outputDirectory?: string;
}

export interface ProcessingRunInfo {
  runId: string;
  /** The document being processed, when the run's source recorded a name. */
  fileName: string | null;
  currentStep: number;
  stepCount: number;
}

export interface ProcessingRecordSummary {
  id: string;
  enabled: boolean;
  steps: {
    operation: string;
    parameters: Record<string, unknown>;
    assets?: Record<string, unknown>;
  }[];
}

export interface MountedFileState {
  name: string;
  state: "done" | "processing" | "failed" | "waiting";
  hasOriginal?: boolean;
}

export interface ProcessingFoldersApi {
  /** The folder's processing state; undefined means an ordinary folder. */
  stateFor: (folder: FolderRecord) => ProcessingFolderState | undefined;
  recordFor: (folder: FolderRecord) => ProcessingRecordSummary | undefined;
  /** Server-storage folder ids whose processing is enabled, for id-only callers. */
  enabledFolderIds: ReadonlySet<string>;
  anyEnabled: boolean;
  /** The record's runs that are currently executing (or queued to). */
  listActiveRuns: (recordId: string) => Promise<ProcessingRunInfo[]>;
  listFiles: (recordId: string) => Promise<MountedFileState[]>;
  /** Retry one failed file now; other parked failures stay parked. */
  retryFile: (recordId: string, name: string) => Promise<void>;
  /** Restore a file's original: pauses the folder; the file reads as waiting. */
  revertFile: (recordId: string, name: string) => Promise<void>;
  /** Restore every archived original: pauses the folder; mid-run files are skipped. */
  revertAll: (
    folder: FolderRecord,
  ) => Promise<{ restored: number; skipped: number } | undefined>;
  /** Attach the default (classification) pipeline, or resume a paused one. */
  enable: (folder: FolderRecord) => Promise<void>;
  /** Pause processing; history stays, so resuming never re-runs finished work. */
  disable: (folder: FolderRecord) => Promise<void>;
  /** Remove the processing behaviour and its history; the folder and files stay. */
  remove: (folder: FolderRecord) => Promise<void>;
  sweep: (folder: FolderRecord) => Promise<void>;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * One shared instance, so every caller sees a stable identity. Returning a fresh literal
 * per render makes the members unstable deps: an effect keyed on one of them re-runs every
 * render, and any state it sets re-renders, which is an unbounded loop.
 */
const INERT: ProcessingFoldersApi = {
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

/**
 * Processing folders, whatever kind of folder they watch. Inert in core; the proprietary
 * build shadows this with an implementation backed by `/api/v1/processing-folders`.
 */
export function useProcessingFolders(): ProcessingFoldersApi {
  return INERT;
}

/** Reload the shared list. No-op in core, which has no processing folders. */
export function refreshProcessingFolders(): Promise<void> {
  return Promise.resolve();
}
