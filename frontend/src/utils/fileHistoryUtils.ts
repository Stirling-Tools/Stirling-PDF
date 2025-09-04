/**
 * File History Utilities
 *
 * Helper functions for integrating PDF metadata service with FileContext operations.
 * Handles extraction of history from files and preparation for metadata injection.
 */

import { pdfMetadataService, type ToolOperation } from '../services/pdfMetadataService';
import { FileRecord } from '../types/fileContext';
import { FileId, FileMetadata } from '../types/file';
import { createFileId } from '../types/fileContext';

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Extract history information from a PDF file and update FileRecord
 */
export async function extractFileHistory(
  file: File,
  record: FileRecord
): Promise<FileRecord> {
  // Only process PDF files
  if (!file.type.includes('pdf')) {
    return record;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const historyMetadata = await pdfMetadataService.extractHistoryMetadata(arrayBuffer);

    if (historyMetadata) {
      const history = historyMetadata.stirlingHistory;

      // Update record with history information
      return {
        ...record,
        originalFileId: history.originalFileId,
        versionNumber: history.versionNumber,
        parentFileId: history.parentFileId as FileId | undefined,
        toolHistory: history.toolChain
      };
    }
  } catch (error) {
    if (DEBUG) console.warn('📄 Failed to extract file history:', file.name, error);
  }

  return record;
}

/**
 * Inject history metadata into a PDF file for tool operations
 */
export async function injectHistoryForTool(
  file: File,
  sourceFileRecord: FileRecord,
  toolName: string,
  parameters?: Record<string, any>
): Promise<File> {
  // Only process PDF files
  if (!file.type.includes('pdf')) {
    return file;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();

    // Create tool operation record
    const toolOperation: ToolOperation = {
      toolName,
      timestamp: Date.now(),
      parameters
    };

    let modifiedBytes: ArrayBuffer;

    // Extract version info directly from the PDF metadata to ensure accuracy
    const existingHistoryMetadata = await pdfMetadataService.extractHistoryMetadata(arrayBuffer);

    let newVersionNumber: number;
    let originalFileId: string;
    let parentFileId: string;
    let parentToolChain: ToolOperation[];

    if (existingHistoryMetadata) {
      // File already has embedded history - increment version
      const history = existingHistoryMetadata.stirlingHistory;
      newVersionNumber = history.versionNumber + 1;
      originalFileId = history.originalFileId;
      parentFileId = sourceFileRecord.id; // This file becomes the parent
      parentToolChain = history.toolChain || [];

    } else if (sourceFileRecord.originalFileId && sourceFileRecord.versionNumber) {
      // File record has history but PDF doesn't (shouldn't happen, but fallback)
      newVersionNumber = sourceFileRecord.versionNumber + 1;
      originalFileId = sourceFileRecord.originalFileId;
      parentFileId = sourceFileRecord.id;
      parentToolChain = sourceFileRecord.toolHistory || [];
    } else {
      // File has no history - this becomes version 1
      newVersionNumber = 1;
      originalFileId = sourceFileRecord.id; // Use source file ID as original
      parentFileId = sourceFileRecord.id; // Parent is the source file
      parentToolChain = []; // No previous tools
    }

    // Create new tool chain with the new operation
    const newToolChain = [...parentToolChain, toolOperation];

    modifiedBytes = await pdfMetadataService.injectHistoryMetadata(
      arrayBuffer,
      originalFileId,
      parentFileId,
      newToolChain,
      newVersionNumber
    );

    // Create new file with updated metadata
    return new File([modifiedBytes], file.name, { type: file.type });
  } catch (error) {
    if (DEBUG) console.warn('📄 Failed to inject history for tool operation:', error);
    return file; // Return original file if injection fails
  }
}

/**
 * Prepare FormData with history-injected PDFs for tool operations
 */
export async function prepareFilesWithHistory(
  files: File[],
  getFileRecord: (file: File) => FileRecord | undefined,
  toolName: string,
  parameters?: Record<string, any>
): Promise<File[]> {
  const processedFiles: File[] = [];

  for (const file of files) {
    const record = getFileRecord(file);
    if (!record) {
      processedFiles.push(file);
      continue;
    }

    const fileWithHistory = await injectHistoryForTool(file, record, toolName, parameters);
    processedFiles.push(fileWithHistory);
  }

  return processedFiles;
}

/**
 * Verify that processed files preserved metadata from originals
 * Logs warnings for tools that strip standard PDF metadata
 */
export async function verifyToolMetadataPreservation(
  originalFiles: File[],
  processedFiles: File[],
  toolName: string
): Promise<void> {
  if (originalFiles.length === 0 || processedFiles.length === 0) return;

  try {
    // For single-file tools, compare the original with the processed file
    if (originalFiles.length === 1 && processedFiles.length === 1) {
      const originalBytes = await originalFiles[0].arrayBuffer();
      const processedBytes = await processedFiles[0].arrayBuffer();

      await pdfMetadataService.verifyMetadataPreservation(
        originalBytes,
        processedBytes,
        toolName
      );
    }
    // For multi-file tools, we could add more complex verification later
  } catch (error) {
    if (DEBUG) console.warn(`📄 Failed to verify metadata preservation for ${toolName}:`, error);
  }
}

/**
 * Group files by processing branches - each branch ends in a leaf file
 * Returns Map<fileId, lineagePath[]> where fileId is the leaf and lineagePath is the path back to original
 */
export function groupFilesByOriginal(fileRecords: FileRecord[]): Map<string, FileRecord[]> {
  const groups = new Map<string, FileRecord[]>();

  // Create a map for quick lookups
  const fileMap = new Map<string, FileRecord>();
  for (const record of fileRecords) {
    fileMap.set(record.id, record);
  }

  // Find leaf files (files that are not parents of any other files AND have version history)
  // Original files (v0) should only be leaves if they have no processed versions at all
  const leafFiles = fileRecords.filter(record => {
    const isParentOfOthers = fileRecords.some(otherRecord => otherRecord.parentFileId === record.id);
    const isOriginalOfOthers = fileRecords.some(otherRecord => otherRecord.originalFileId === record.id);
    
    // A file is a leaf if:
    // 1. It's not a parent of any other files, AND
    // 2. It has processing history (versionNumber > 0) OR it's not referenced as original by others
    return !isParentOfOthers && (record.versionNumber && record.versionNumber > 0 || !isOriginalOfOthers);
  });

  // For each leaf file, build its complete lineage path back to original
  for (const leafFile of leafFiles) {
    const lineagePath: FileRecord[] = [];
    let currentFile: FileRecord | undefined = leafFile;
    
    // Trace back through parentFileId chain to build this specific branch
    while (currentFile) {
      lineagePath.push(currentFile);
      
      // Move to parent file in this branch
      let nextFile: FileRecord | undefined = undefined;
      
      if (currentFile.parentFileId) {
        nextFile = fileMap.get(currentFile.parentFileId);
      } else if (currentFile.originalFileId && currentFile.originalFileId !== currentFile.id) {
        // For v1 files, the original file might be referenced by originalFileId
        nextFile = fileMap.get(currentFile.originalFileId);
      }
      
      // Check for infinite loops before moving to next
      if (nextFile && lineagePath.some(file => file.id === nextFile!.id)) {
        break;
      }
      
      currentFile = nextFile;
    }
    
    // Sort lineage with latest version first (leaf at top)
    lineagePath.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    
    // Use leaf file ID as the group key - each branch gets its own group
    groups.set(leafFile.id, lineagePath);
  }

  return groups;
}

/**
 * Get the latest version of each file group (optimized version using leaf flags)
 */
export function getLatestVersions(fileRecords: FileRecord[]): FileRecord[] {
  // If we have leaf flags, use them for much faster filtering
  const hasLeafFlags = fileRecords.some(record => record.isLeaf !== undefined);
  
  if (hasLeafFlags) {
    // Fast path: just return files marked as leaf nodes
    return fileRecords.filter(record => record.isLeaf !== false); // Default to true if undefined
  } else {
    // Fallback to expensive calculation for backward compatibility
    const groups = groupFilesByOriginal(fileRecords);
    const latestVersions: FileRecord[] = [];

    for (const [_, records] of groups) {
      if (records.length > 0) {
        // First item is the latest version (sorted desc by version number)
        latestVersions.push(records[0]);
      }
    }

    return latestVersions;
  }
}

/**
 * Get version history for a file
 */
export function getVersionHistory(
  targetRecord: FileRecord,
  allRecords: FileRecord[]
): FileRecord[] {
  const originalId = targetRecord.originalFileId || targetRecord.id;

  return allRecords
    .filter(record => {
      const recordOriginalId = record.originalFileId || record.id;
      return recordOriginalId === originalId;
    })
    .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
}

/**
 * Check if a file has version history
 */
export function hasVersionHistory(record: FileRecord): boolean {
  return !!(record.originalFileId && record.versionNumber && record.versionNumber > 0);
}

/**
 * Generate a descriptive name for a file version
 */
export function generateVersionName(record: FileRecord): string {
  const baseName = record.name.replace(/\.pdf$/i, '');

  if (!hasVersionHistory(record)) {
    return record.name;
  }

  const versionInfo = record.versionNumber ? ` (v${record.versionNumber})` : '';
  const toolInfo = record.toolHistory && record.toolHistory.length > 0
    ? ` - ${record.toolHistory[record.toolHistory.length - 1].toolName}`
    : '';

  return `${baseName}${versionInfo}${toolInfo}.pdf`;
}

/**
 * Get recent files efficiently using leaf flags from IndexedDB
 * This is much faster than loading all files and calculating leaf nodes
 */
export async function getRecentLeafFiles(): Promise<import('../services/fileStorage').StoredFile[]> {
  try {
    const { fileStorage } = await import('../services/fileStorage');
    return await fileStorage.getLeafFiles();
  } catch (error) {
    console.warn('Failed to get recent leaf files from IndexedDB:', error);
    return [];
  }
}

/**
 * Get recent file metadata efficiently using leaf flags from IndexedDB
 * This is much faster than loading all files and calculating leaf nodes
 */
export async function getRecentLeafFileMetadata(): Promise<Omit<import('../services/fileStorage').StoredFile, 'data'>[]> {
  try {
    const { fileStorage } = await import('../services/fileStorage');
    return await fileStorage.getLeafFileMetadata();
  } catch (error) {
    console.warn('Failed to get recent leaf file metadata from IndexedDB:', error);
    return [];
  }
}

/**
 * Create metadata for storing files with history information
 */
export async function createFileMetadataWithHistory(
  file: File,
  fileId: FileId,
  thumbnail?: string
): Promise<FileMetadata> {
  const baseMetadata: FileMetadata = {
    id: fileId,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    thumbnail,
    isLeaf: true // New files are leaf nodes by default
  };

  // Extract metadata for PDF files
  if (file.type.includes('pdf')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const [historyMetadata, standardMetadata] = await Promise.all([
        pdfMetadataService.extractHistoryMetadata(arrayBuffer),
        pdfMetadataService.extractStandardMetadata(arrayBuffer)
      ]);

      const result = { ...baseMetadata };

      // Add standard PDF metadata if available
      if (standardMetadata) {
        result.pdfMetadata = standardMetadata;
      }

      // Add history metadata if available
      if (historyMetadata) {
        const history = historyMetadata.stirlingHistory;
        result.originalFileId = history.originalFileId;
        result.versionNumber = history.versionNumber;
        result.parentFileId = history.parentFileId as FileId | undefined;
        result.historyInfo = {
          originalFileId: history.originalFileId,
          parentFileId: history.parentFileId,
          versionNumber: history.versionNumber,
          toolChain: history.toolChain
        };
      }

      return result;
    } catch (error) {
      if (DEBUG) console.warn('📄 Failed to extract metadata:', file.name, error);
    }
  }

  return baseMetadata;
}
