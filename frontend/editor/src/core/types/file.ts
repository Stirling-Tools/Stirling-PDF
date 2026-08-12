/**
 * File types for the new architecture
 * FileContext uses pure File objects with separate ID tracking
 */

import { ToolId } from "@app/types/toolId";
import { FolderId } from "@app/types/folder";

declare const tag: unique symbol;
export type FileId = string & { readonly [tag]: "FileId" };

/**
 * Tool operation metadata for history tracking
 * Note: Parameters removed for security - sensitive data like passwords should not be stored in history
 */
export interface ToolOperation {
  toolId: ToolId;
  timestamp: number;
}

/**
 * Base file metadata shared between storage and runtime layers
 * Contains all common file properties and history tracking
 */
export interface BaseFileMetadata {
  id: FileId;
  name: string;
  type: string;
  size: number;
  lastModified: number;
  createdAt?: number; // When file was added to system

  // File history tracking
  isLeaf: boolean; // True if this file hasn't been processed yet
  originalFileId: string; // Root file ID for grouping versions
  versionNumber: number; // Version number in chain
  parentFileId?: FileId; // Immediate parent file ID
  toolHistory?: ToolOperation[]; // Tool chain for history tracking

  /**
   * True if this file was produced by a tool/automation in-app (any
   * `consumeFiles` output — a versioned edit OR an independent artifact like a
   * convert/split/merge result) rather than entering the system as a genuine
   * upload. Set at the consume chokepoint so it covers both kinds, including
   * independent artifacts whose version metadata is otherwise indistinguishable
   * from a fresh upload. Persisted so the distinction survives a reload.
   * Used by input-mode (upload) policy auto-run to enforce only on real uploads.
   */
  derivedFromTool?: boolean;

  /**
   * Transitive set of fileIds this file was derived from — the inputs of the
   * tool operation that produced it, plus those inputs' own `sourceFileIds`.
   * Recorded at the `consumeFiles` boundary, the only place that knows the
   * input→output mapping. Unlike `parentFileId` (the version chain) this is a
   * pure provenance link, so it covers independent artifacts — split (1→N),
   * merge (N→1), convert — that intentionally have no parent. Being transitive,
   * it survives an intermediate edit being consumed/removed. Persisted; used so
   * a policy badge follows a document onto everything derived from it. Legacy
   * files predate it (the link was never recorded) and stay empty.
   */
  sourceFileIds?: FileId[];

  /**
   * The cloud folder this file lives in. Semantics:
   * - `remoteStorageId == null` → file is local-only; folderId MUST be null.
   * - `remoteStorageId != null && folderId == null` → file is at the cloud root.
   * - `remoteStorageId != null && folderId == X` → file lives in cloud folder X.
   *
   * The "Local" pseudo-folder in the UI is the predicate `remoteStorageId == null`;
   * it has no corresponding {@code folderId} value. Folders are a server-only concept.
   */
  folderId?: FolderId | null;

  // Remote storage tracking
  remoteStorageId?: number; // Server-side storage ID for this file chain
  remoteStorageUpdatedAt?: number; // Timestamp when chain was last uploaded
  remoteOwnerUsername?: string; // Server-side owner username (if known)
  remoteOwnedByCurrentUser?: boolean; // Ownership flag for server files
  remoteAccessRole?: string; // Access role for shared server files
  remoteSharedViaLink?: boolean; // True when imported from a share link
  remoteHasShareLinks?: boolean; // True when owner has shared this file
  remoteHasUserShares?: boolean; // True when owner has invited specific users
  remoteShareToken?: string; // Share token when file is from a share link
}

/**
 * Minimal file shape used by signing workflow components.
 * Both StirlingFile (extends File) and StirlingFileStub are assignable to this.
 */
export interface FileState {
  name: string;
  size: number;
}
