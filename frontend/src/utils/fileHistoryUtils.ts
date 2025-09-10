/**
 * File History Utilities
 *
 * Helper functions for IndexedDB-based file history management.
 * Handles file history operations and lineage tracking.
 */
import { StirlingFileStub } from '../types/fileContext';
import { FileId } from '../types/file';
import { StoredFileMetadata } from '../services/fileStorage';






/**
 * Group files by processing branches - each branch ends in a leaf file
 * Returns Map<fileId, lineagePath[]> where fileId is the leaf and lineagePath is the path back to original
 */
export function groupFilesByOriginal(StirlingFileStubs: StirlingFileStub[]): Map<string, StirlingFileStub[]> {
  const groups = new Map<string, StirlingFileStub[]>();

  // Create a map for quick lookups
  const fileMap = new Map<string, StirlingFileStub>();
  for (const record of StirlingFileStubs) {
    fileMap.set(record.id, record);
  }

  // Find leaf files (files that are not parents of any other files AND have version history)
  // Original files (v0) should only be leaves if they have no processed versions at all
  const leafFiles = StirlingFileStubs.filter(stub => {
    const isParentOfOthers = StirlingFileStubs.some(otherStub => otherStub.parentFileId === stub.id);
    const isOriginalOfOthers = StirlingFileStubs.some(otherStub => otherStub.originalFileId === stub.id);

    // A file is a leaf if:
    // 1. It's not a parent of any other files, AND
    // 2. It has processing history (versionNumber > 0) OR it's not referenced as original by others
    return !isParentOfOthers && (stub.versionNumber && stub.versionNumber > 0 || !isOriginalOfOthers);
  });

  // For each leaf file, build its complete lineage path back to original
  for (const leafFile of leafFiles) {
    const lineagePath: StirlingFileStub[] = [];
    let currentFile: StirlingFileStub | undefined = leafFile;

    // Trace back through parentFileId chain to build this specific branch
    while (currentFile) {
      lineagePath.push(currentFile);

      // Move to parent file in this branch
      let nextFile: StirlingFileStub | undefined = undefined;

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
export function getLatestVersions(fileStubs: StirlingFileStub[]): StirlingFileStub[] {
  // If we have leaf flags, use them for much faster filtering
  const hasLeafFlags = fileStubs.some(fileStub => fileStub.isLeaf !== undefined);

  if (hasLeafFlags) {
    // Fast path: just return files marked as leaf nodes
    return fileStubs.filter(fileStub => fileStub.isLeaf !== false); // Default to true if undefined
  } else {
    // Fallback to expensive calculation for backward compatibility
    const groups = groupFilesByOriginal(fileStubs);
    const latestVersions: StirlingFileStub[] = [];

    for (const [_, fileStubs] of groups) {
      if (fileStubs.length > 0) {
        // First item is the latest version (sorted desc by version number)
        latestVersions.push(fileStubs[0]);
      }
    }

    return latestVersions;
  }
}

/**
 * Get version history for a file
 */
export function getVersionHistory(
  targetFileStub: StirlingFileStub,
  allFileStubs: StirlingFileStub[]
): StirlingFileStub[] {
  const originalId = targetFileStub.originalFileId || targetFileStub.id;

  return allFileStubs
    .filter(fileStub => {
      const fileStubOriginalId = fileStub.originalFileId || fileStub.id;
      return fileStubOriginalId === originalId;
    })
    .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
}

/**
 * Check if a file has version history
 */
export function hasVersionHistory(fileStub: StirlingFileStub): boolean {
  return !!(fileStub.originalFileId && fileStub.versionNumber && fileStub.versionNumber > 0);
}

/**
 * Generate a descriptive name for a file version
 */
export function generateVersionName(fileStub: StirlingFileStub): string {
  const baseName = fileStub.name.replace(/\.pdf$/i, '');

  if (!hasVersionHistory(fileStub)) {
    return fileStub.name;
  }

  const versionInfo = fileStub.versionNumber ? ` (v${fileStub.versionNumber})` : '';
  const toolInfo = fileStub.toolHistory && fileStub.toolHistory.length > 0
    ? ` - ${fileStub.toolHistory[fileStub.toolHistory.length - 1].toolName}`
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
export async function getRecentLeafFileMetadata(): Promise<StoredFileMetadata[]> {
  try {
    const { fileStorage } = await import('../services/fileStorage');
    return await fileStorage.getLeafFileMetadata();
  } catch (error) {
    console.warn('Failed to get recent leaf file metadata from IndexedDB:', error);
    return [];
  }
}



/**
 * Create basic metadata for storing files
 * History information is managed separately in IndexedDB
 */
export async function createFileMetadataWithHistory(
  file: File,
  fileId: FileId,
  thumbnail?: string
): Promise<StoredFileMetadata> {
  return {
    id: fileId,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    thumbnail,
    isLeaf: true // New files are leaf nodes by default
  };
}
