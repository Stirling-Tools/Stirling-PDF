/**
 * File types for the new architecture
 * FileContext uses pure File objects with separate ID tracking
 */

import { ToolId } from "@app/types/toolId";

declare const tag: unique symbol;
export type FileId = string & { readonly [tag]: 'FileId' };

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

  // Remote storage tracking
  remoteStorageId?: number; // Server-side storage ID for this file chain
  remoteStorageUpdatedAt?: number; // Timestamp when chain was last uploaded
  remoteOwnerUsername?: string; // Server-side owner username (if known)
  remoteOwnedByCurrentUser?: boolean; // Ownership flag for server files
  remoteSharedViaLink?: boolean; // True when imported from a share link
  remoteHasShareLinks?: boolean; // True when owner has shared this file
  remoteShareToken?: string; // Share token when file is from a share link
}
