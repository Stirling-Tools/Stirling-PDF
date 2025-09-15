/**
 * File types for the new architecture
 * FileContext uses pure File objects with separate ID tracking
 */

declare const tag: unique symbol;
export type FileId = string & { readonly [tag]: 'FileId' };

/**
 * Tool operation metadata for history tracking
 * Note: Parameters removed for security - sensitive data like passwords should not be stored in history
 */
export interface ToolOperation {
  toolName: string;
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
  toolHistory?: Array<{
    toolName: string;
    timestamp: number;
  }>; // Tool chain for history tracking

}
