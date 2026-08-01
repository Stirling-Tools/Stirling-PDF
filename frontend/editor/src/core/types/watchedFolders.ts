/**
 * Types for Watched Folders (a.k.a. Watched Folders) functionality.
 *
 * Server-backed persistence and server-side processing fields are intentionally
 * not in this type — they land in a follow-up PR.
 */

export interface WatchedFolder {
  id: string;
  name: string;
  description: string;
  automationId: string; // FK → AutomationConfig.id
  icon: string; // icon name string
  accentColor: string; // hex e.g. '#3b82f6'
  createdAt: string;
  updatedAt: string;
  order?: number;
  isDefault?: boolean;
  isPaused?: boolean;
  maxRetries?: number; // 0 = disabled; default 3
  retryDelayMinutes?: number; // default 5
  outputMode?: "new_file" | "new_version"; // default: 'new_file'
  outputName?: string; // output filename prefix/suffix
  outputNamePosition?: "prefix" | "suffix" | "auto-number"; // default: 'prefix'
  hasOutputDirectory?: boolean; // true when a local FS output folder is configured
  /** Where input files come from. Default: 'idb' (dropped/sidebar files stay in browser). */
  inputSource?: "idb" | "local-folder";
  /** Set when this folder is the backing store for a Policy (its category id).
   *  Policy-owned folders are filtered out of the Watched Folders UI. */
  policyCategoryId?: string;
}

export interface FolderFileMetadata {
  addedAt: Date;
  status: "pending" | "processing" | "processed" | "error";
  processedAt?: Date;
  /** All output file ids produced by this run — references stirling-pdf-files */
  displayFileIds?: string[];
  /** First output file id — kept for backwards compat with existing records */
  displayFileId?: string;
  /** True when the folder created this file from a disk drop and therefore owns it.
   *  False / absent when the file came from the shared sidebar store — do NOT delete on folder removal. */
  ownedByFolder?: boolean;
  errorMessage?: string;
  failedAttempts?: number;
  nextRetryAt?: number; // ms timestamp — set when an automatic retry is scheduled
  lastFailedAt?: Date;
  name?: string; // original filename
}

export interface FolderRecord {
  folderId: string;
  files: Record<string, FolderFileMetadata>;
  lastUpdated: number;
}

export interface WatchedFolderRunEntry {
  inputFileId: string;
  /** First output file id */
  displayFileId: string;
  /** All output file ids produced by this run — kept in sync with FolderFileMetadata.displayFileIds */
  displayFileIds?: string[];
  /** When this run completed — used for TTL-based "done" status */
  processedAt?: Date;
  status: "processing" | "processed";
}
