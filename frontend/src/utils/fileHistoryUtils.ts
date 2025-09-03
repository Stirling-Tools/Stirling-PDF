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
 * Group files by their original file ID for version management
 */
export function groupFilesByOriginal(fileRecords: FileRecord[]): Map<string, FileRecord[]> {
  const groups = new Map<string, FileRecord[]>();

  for (const record of fileRecords) {
    // For files with history, use their originalFileId
    // For files without history, check if any other file references this file as originalFileId
    let groupKey = record.originalFileId;

    if (!groupKey) {
      // Check if this file is referenced as an originalFileId by other files
      const isReferencedAsOriginal = fileRecords.some(otherRecord =>
        otherRecord.originalFileId === record.id
      );

      if (isReferencedAsOriginal) {
        // This file is the original of other files
        groupKey = record.id;
      } else {
        // This file is truly standalone
        groupKey = record.id;
      }
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey)!.push(record);
  }

  // Sort each group by version number
  for (const [_, records] of groups) {
    records.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
  }

  return groups;
}

/**
 * Get the latest version of each file group
 */
export function getLatestVersions(fileRecords: FileRecord[]): FileRecord[] {
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
    thumbnail
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
