import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import JSZip from 'jszip';
import { fileStorage } from '@app/services/fileStorage';
import { zipFileService } from '@app/services/zipFileService';
import { StirlingFileStub } from '@app/types/fileContext';
import { downloadFiles } from '@app/utils/downloadUtils';
import { FileId } from '@app/types/file';
import { groupFilesByOriginal } from '@app/utils/fileHistoryUtils';
import { Z_INDEX_OVER_FILE_MANAGER_MODAL } from '@app/styles/zIndex';
import apiClient from '@app/services/apiClient';
import { alert } from '@app/components/toast';
import { useTranslation } from 'react-i18next';

// Type for the context value - now contains everything directly
interface FileManagerContextValue {
  // State
  activeSource: 'recent' | 'local' | 'drive';
  storageFilter: 'all' | 'local' | 'sharedWithMe' | 'sharedByMe';
  selectedFileIds: FileId[];
  searchTerm: string;
  selectedFiles: StirlingFileStub[];
  filteredFiles: StirlingFileStub[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFilesSet: Set<FileId>;
  expandedFileIds: Set<FileId>;
  fileGroups: Map<FileId, StirlingFileStub[]>;
  loadedHistoryFiles: Map<FileId, StirlingFileStub[]>;
  isLoading: boolean;
  activeFileIds: FileId[];

  // Handlers
  onSourceChange: (source: 'recent' | 'local' | 'drive') => void;
  onStorageFilterChange: (filter: 'all' | 'local' | 'sharedWithMe' | 'sharedByMe') => void;
  onLocalFileClick: () => void;
  onFileSelect: (file: StirlingFileStub, index: number, shiftKey?: boolean) => void;
  onFileRemove: (index: number) => void;
  onHistoryFileRemove: (file: StirlingFileStub) => void;
  onFileDoubleClick: (file: StirlingFileStub) => void;
  onOpenFiles: () => void;
  onSearchChange: (value: string) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onDownloadSelected: () => void;
  onDownloadSingle: (file: StirlingFileStub) => void;
  onToggleExpansion: (fileId: FileId) => void;
  onAddToRecents: (file: StirlingFileStub) => void;
  onUnzipFile: (file: StirlingFileStub) => Promise<void>;
  onMakeCopy: (file: StirlingFileStub) => Promise<void>;
  onNewFilesSelect: (files: File[]) => void;
  onGoogleDriveSelect: (files: File[]) => void;
  refreshRecentFiles: () => Promise<void>;

  // External props
  recentFiles: StirlingFileStub[];
  isFileSupported: (fileName: string) => boolean;
  modalHeight: string;
}

// Create the context
const FileManagerContext = createContext<FileManagerContextValue | null>(null);

// Provider component props
interface FileManagerProviderProps {
  children: React.ReactNode;
  recentFiles: StirlingFileStub[];
  onRecentFilesSelected: (files: StirlingFileStub[]) => void; // For selecting stored files
  onNewFilesSelect: (files: File[]) => void; // For uploading new local files
  onClose: () => void;
  isFileSupported: (fileName: string) => boolean;
  isOpen: boolean;
  onFileRemove: (index: number) => void;
  modalHeight: string;
  refreshRecentFiles: () => Promise<void>;
  isLoading: boolean;
  activeFileIds: FileId[];
}

type RemoteDeleteChoice = 'local' | 'server' | 'both' | 'cancel';

export const FileManagerProvider: React.FC<FileManagerProviderProps> = ({
  children,
  recentFiles,
  onRecentFilesSelected,
  onNewFilesSelect,
  onClose,
  isFileSupported,
  isOpen,
  onFileRemove,
  modalHeight,
  refreshRecentFiles,
  isLoading,
  activeFileIds,
}) => {
  const [activeSource, setActiveSource] = useState<'recent' | 'local' | 'drive'>('recent');
  const [storageFilter, setStorageFilter] = useState<
    'all' | 'local' | 'sharedWithMe' | 'sharedByMe'
  >('all');
  const [selectedFileIds, setSelectedFileIds] = useState<FileId[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [expandedFileIds, setExpandedFileIds] = useState<Set<FileId>>(new Set());
  const [loadedHistoryFiles, setLoadedHistoryFiles] = useState<Map<FileId, StirlingFileStub[]>>(new Map()); // Cache for loaded history
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletePromptFile, setDeletePromptFile] = useState<StirlingFileStub | null>(null);
  const deletePromptResolveRef = useRef<((choice: RemoteDeleteChoice) => void) | null>(null);
  const { t } = useTranslation();

  // Track blob URLs for cleanup
  const createdBlobUrls = useRef<Set<string>>(new Set());


  // Computed values (with null safety)
  const selectedFilesSet = new Set(selectedFileIds);

  // Group files by original file ID for version management
  const fileGroups = useMemo(() => {
    if (!recentFiles || recentFiles.length === 0) return new Map();

    // Convert StirlingFileStub to FileRecord-like objects for grouping utility
    const recordsForGrouping = recentFiles.map(file => ({
      ...file,
      originalFileId: file.originalFileId,
      versionNumber: file.versionNumber || 1
    }));

    return groupFilesByOriginal(recordsForGrouping);
  }, [recentFiles]);

  // Get files to display with expansion logic
  const displayFiles = useMemo(() => {
    if (!recentFiles || recentFiles.length === 0) return [];

    // Only return leaf files - history files will be handled by separate components
    if (storageFilter === 'sharedWithMe') {
      return recentFiles.filter(
        (file) => file.remoteOwnedByCurrentUser === false || file.remoteSharedViaLink
      );
    }
    if (storageFilter === 'sharedByMe') {
      return recentFiles.filter(
        (file) => file.remoteOwnedByCurrentUser !== false && file.remoteHasShareLinks
      );
    }
    if (storageFilter === 'local') {
      return recentFiles.filter(
        (file) => !file.remoteStorageId && !file.remoteSharedViaLink
      );
    }
    return recentFiles;
  }, [recentFiles, storageFilter]);

  const selectedFiles = selectedFileIds.length === 0 ? [] :
    displayFiles.filter(file => selectedFilesSet.has(file.id));

  const filteredFiles = !searchTerm ? displayFiles :
    displayFiles.filter(file =>
      file.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const handleSourceChange = useCallback((source: 'recent' | 'local' | 'drive') => {
    setActiveSource(source);
    if (source !== 'recent') {
      setSelectedFileIds([]);
      setSearchTerm('');
      setLastClickedIndex(null);
    }
  }, []);

  const handleStorageFilterChange = useCallback((filter: 'all' | 'local' | 'sharedWithMe' | 'sharedByMe') => {
    setStorageFilter(filter);
    setSelectedFileIds([]);
    setLastClickedIndex(null);
  }, []);

  const parseFilename = useCallback((disposition: string | undefined): string | null => {
    if (!disposition) return null;
    const filenameMatch = /filename="([^"]+)"/i.exec(disposition);
    if (filenameMatch?.[1]) return filenameMatch[1];
    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]);
      } catch {
        return utf8Match[1];
      }
    }
    return null;
  }, []);

  const extractLatestFilesFromBundle = useCallback(async (blob: Blob, filename: string, contentType: string): Promise<File[]> => {
    const isZip = contentType.includes('zip') || filename.toLowerCase().endsWith('.zip');
    if (!isZip) {
      return [new File([blob], filename, { type: contentType || blob.type })];
    }

    const zip = await JSZip.loadAsync(blob);
    const manifestEntry = zip.file('stirling-share.json');
    if (!manifestEntry) {
      return [new File([blob], filename, { type: contentType || blob.type })];
    }

    const manifestText = await manifestEntry.async('text');
    const manifest = JSON.parse(manifestText) as {
      rootLogicalId: string;
      rootLogicalIds?: string[];
      entries: Array<{
        rootLogicalId?: string;
        versionNumber: number;
        name: string;
        type: string;
        lastModified: number;
        filePath: string;
      }>;
    };
    const entryRootId = (entry: (typeof manifest.entries)[number]) =>
      entry.rootLogicalId || manifest.rootLogicalId;
    const rootOrder =
      manifest.rootLogicalIds && manifest.rootLogicalIds.length > 0
        ? manifest.rootLogicalIds
        : Array.from(new Set(manifest.entries.map(entryRootId)));

    const latestFiles: File[] = [];
    for (const rootId of rootOrder) {
      const rootEntries = manifest.entries
        .filter((entry) => entryRootId(entry) === rootId)
        .sort((a, b) => a.versionNumber - b.versionNumber);
      const latestEntry = rootEntries[rootEntries.length - 1];
      if (!latestEntry) continue;
      const zipEntry = zip.file(latestEntry.filePath);
      if (!zipEntry) continue;
      const fileBlob = await zipEntry.async('blob');
      latestFiles.push(
        new File([fileBlob], latestEntry.name, {
          type: latestEntry.type,
          lastModified: latestEntry.lastModified,
        })
      );
    }

    if (latestFiles.length > 0) {
      return latestFiles;
    }

    return [new File([blob], filename, { type: contentType || blob.type })];
  }, []);

  const requestDeleteChoice = useCallback((file: StirlingFileStub): Promise<RemoteDeleteChoice> => {
    return new Promise((resolve) => {
      deletePromptResolveRef.current = resolve;
      setDeletePromptFile(file);
    });
  }, []);

  const resolveDeleteChoice = useCallback((choice: RemoteDeleteChoice) => {
    const resolver = deletePromptResolveRef.current;
    deletePromptResolveRef.current = null;
    setDeletePromptFile(null);
    resolver?.(choice);
  }, []);

  const handleLocalFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((file: StirlingFileStub, currentIndex: number, shiftKey?: boolean) => {
    const fileId = file.id;
    if (!fileId) return;

    if (shiftKey && lastClickedIndex !== null) {
      // Range selection with shift-click
      const startIndex = Math.min(lastClickedIndex, currentIndex);
      const endIndex = Math.max(lastClickedIndex, currentIndex);

      setSelectedFileIds(prev => {
        const selectedSet = new Set(prev);

        // Add all files in the range to selection
        for (let i = startIndex; i <= endIndex; i++) {
          const rangeFileId = filteredFiles[i]?.id;
          if (rangeFileId) {
            selectedSet.add(rangeFileId);
          }
        }

        return Array.from(selectedSet);
      });
    } else {
      // Normal click behavior - optimized with Set for O(1) lookup
      setSelectedFileIds(prev => {
        const selectedSet = new Set(prev);

        if (selectedSet.has(fileId)) {
          selectedSet.delete(fileId);
        } else {
          selectedSet.add(fileId);
        }

        return Array.from(selectedSet);
      });

      // Update last clicked index for future range selections
      setLastClickedIndex(currentIndex);
    }
  }, [filteredFiles, lastClickedIndex]);

  // Helper function to safely determine which files can be deleted
  const getSafeFilesToDelete = useCallback((
    fileIds: FileId[],
    allStoredStubs: StirlingFileStub[]
  ): FileId[] => {
    const fileMap = new Map(allStoredStubs.map(f => [f.id, f]));
    const filesToDelete = new Set<FileId>();
    const filesToPreserve = new Set<FileId>();

    // First, identify all files in the lineages of the leaf files being deleted
    for (const leafFileId of fileIds) {
      const currentFile = fileMap.get(leafFileId);
      if (!currentFile) continue;

      // Always include the leaf file itself for deletion
      filesToDelete.add(leafFileId);

      // If this is a processed file with history, trace back through its lineage
      if (currentFile.versionNumber && currentFile.versionNumber > 1) {
        const originalFileId = currentFile.originalFileId || currentFile.id;

        // Find all files in this history chain
        const chainFiles = allStoredStubs.filter((file: StirlingFileStub) =>
          (file.originalFileId || file.id) === originalFileId
        );

        // Add all files in this lineage as candidates for deletion
        chainFiles.forEach(file => filesToDelete.add(file.id));
      }
    }

    // Now identify files that must be preserved because they're referenced by OTHER lineages
    for (const file of allStoredStubs) {
      const fileOriginalId = file.originalFileId || file.id;

      // If this file is a leaf node (not being deleted) and its lineage overlaps with files we want to delete
      if (file.isLeaf !== false && !fileIds.includes(file.id)) {
        // Find all files in this preserved lineage
        const preservedChainFiles = allStoredStubs.filter((chainFile: StirlingFileStub) =>
          (chainFile.originalFileId || chainFile.id) === fileOriginalId
        );

        // Mark all files in this preserved lineage as must-preserve
        preservedChainFiles.forEach(chainFile => filesToPreserve.add(chainFile.id));
      }
    }

    // Final list: files to delete minus files that must be preserved
    let safeToDelete = Array.from(filesToDelete).filter(fileId => !filesToPreserve.has(fileId));

    // Check for orphaned non-leaf files after main deletion
    const remainingFiles = allStoredStubs.filter(file => !safeToDelete.includes(file.id));
    const orphanedNonLeafFiles: FileId[] = [];

    for (const file of remainingFiles) {
      // Only check non-leaf files (files that have been processed and have children)
      if (file.isLeaf === false) {
        const fileOriginalId = file.originalFileId || file.id;

        // Check if this non-leaf file has any living descendants
        const hasLivingDescendants = remainingFiles.some(otherFile => {
          // Check if otherFile is a descendant of this file
          const otherOriginalId = otherFile.originalFileId || otherFile.id;
          return (
            // Direct parent relationship
            otherFile.parentFileId === file.id ||
            // Same lineage but different from this file
            (otherOriginalId === fileOriginalId && otherFile.id !== file.id)
          );
        });

        if (!hasLivingDescendants) {
          orphanedNonLeafFiles.push(file.id);
        }
      }
    }

    // Add orphaned non-leaf files to deletion list
    safeToDelete = [...safeToDelete, ...orphanedNonLeafFiles];

    return safeToDelete;
  }, []);

  // Shared internal delete logic
  const performFileDelete = useCallback(async (fileToRemove: StirlingFileStub, fileIndex: number) => {
    let deleteChoice: RemoteDeleteChoice = 'local';
    if (fileToRemove.remoteStorageId) {
      deleteChoice = await requestDeleteChoice(fileToRemove);
      if (deleteChoice === 'cancel') {
        return;
      }
    }

    const canDeleteServer = fileToRemove.remoteOwnedByCurrentUser !== false;
    const shouldDeleteServer =
      canDeleteServer && (deleteChoice === 'server' || deleteChoice === 'both');
    const shouldDeleteLocal = deleteChoice === 'local' || deleteChoice === 'both';
    const isServerOnly =
      Boolean(fileToRemove.remoteStorageId) && fileToRemove.id.startsWith('server-');

    if (shouldDeleteServer && fileToRemove.remoteStorageId) {
      try {
        await apiClient.delete(
          `/api/v1/storage/files/${fileToRemove.remoteStorageId}`,
          { suppressErrorToast: true } as any
        );
      } catch (error) {
        console.error('Failed to delete file from server:', error);
        alert({
          alertType: 'error',
          title: t(
            'fileManager.removeServerFailed',
            'Could not remove the file from the server.'
          ),
          expandable: false,
          durationMs: 3500,
        });
        return;
      }

      if (!shouldDeleteLocal) {
        const originalFileId = (fileToRemove.originalFileId || fileToRemove.id) as FileId;
        const chain = await fileStorage.getHistoryChainStubs(originalFileId);
        for (const stub of chain) {
          await fileStorage.updateFileMetadata(stub.id, {
            remoteStorageId: undefined,
            remoteStorageUpdatedAt: undefined,
          });
        }
        await refreshRecentFiles();
        alert({
          alertType: 'success',
          title: t('fileManager.removeServerSuccess', 'Removed from server.'),
          expandable: false,
          durationMs: 2500,
        });
        return;
      }
    }

    if (shouldDeleteLocal && isServerOnly) {
      await refreshRecentFiles();
      return;
    }

    const deletedFileId = fileToRemove.id;

    // Get all stored files to analyze lineages
    const allStoredStubs = await fileStorage.getAllStirlingFileStubs();

    // Get safe files to delete (respecting shared lineages)
    const filesToDelete = getSafeFilesToDelete([deletedFileId], allStoredStubs);

    // Clear from selection immediately
    setSelectedFileIds(prev => prev.filter(id => !filesToDelete.includes(id)));

    // Clear from expanded state to prevent ghost entries
    setExpandedFileIds(prev => {
      const newExpanded = new Set(prev);
      filesToDelete.forEach(id => newExpanded.delete(id));
      return newExpanded;
    });

    // Clear from history cache - remove all files in the chain
    setLoadedHistoryFiles(prev => {
      const newCache = new Map(prev);

      // Remove cache entries for all deleted files
      filesToDelete.forEach(id => newCache.delete(id as FileId));

      // Also remove deleted files from any other file's history cache
      for (const [mainFileId, historyFiles] of newCache.entries()) {
        const filteredHistory = historyFiles.filter(histFile => !filesToDelete.includes(histFile.id));
        if (filteredHistory.length !== historyFiles.length) {
          newCache.set(mainFileId, filteredHistory);
        }
      }

      return newCache;
    });

    // Delete safe files from IndexedDB
    try {
      for (const fileId of filesToDelete) {
        await fileStorage.deleteStirlingFile(fileId as FileId);
      }
    } catch (error) {
      console.error('Failed to delete files from chain:', error);
    }

    // Call the parent's deletion logic for the main file only
    onFileRemove(fileIndex);

    // Refresh to ensure consistent state
    await refreshRecentFiles();
  }, [
    getSafeFilesToDelete,
    setSelectedFileIds,
    setExpandedFileIds,
    setLoadedHistoryFiles,
    onFileRemove,
    refreshRecentFiles,
    requestDeleteChoice,
    t,
  ]);

  const handleFileRemove = useCallback(async (index: number) => {
    const fileToRemove = filteredFiles[index];
    if (fileToRemove) {
      await performFileDelete(fileToRemove, index);
    }
  }, [filteredFiles, performFileDelete]);

  // Handle deletion by fileId (more robust than index-based)
  const handleFileRemoveById = useCallback(async (fileId: FileId) => {
    // Find the file and its index in filteredFiles
    const fileIndex = filteredFiles.findIndex(file => file.id === fileId);
    const fileToRemove = filteredFiles[fileIndex];

    if (fileToRemove && fileIndex !== -1) {
      await performFileDelete(fileToRemove, fileIndex);
    }
  }, [filteredFiles, performFileDelete]);

  // Handle deletion of specific history files (not index-based)
  const handleHistoryFileRemove = useCallback(async (fileToRemove: StirlingFileStub) => {
    const deletedFileId = fileToRemove.id;

    // Clear from expanded state to prevent ghost entries
    setExpandedFileIds(prev => {
      const newExpanded = new Set(prev);
      newExpanded.delete(deletedFileId);
      return newExpanded;
    });

    // Clear from history cache - remove all files in the chain
    setLoadedHistoryFiles(prev => {
      const newCache = new Map(prev);

      // Remove cache entries for all deleted files
      newCache.delete(deletedFileId);

      // Also remove deleted files from any other file's history cache
      for (const [mainFileId, historyFiles] of newCache.entries()) {
        const filteredHistory = historyFiles.filter(histFile => deletedFileId != histFile.id);
        if (filteredHistory.length !== historyFiles.length) {
          newCache.set(mainFileId, filteredHistory);
        }
      }

      return newCache;
    });

    // Delete safe files from IndexedDB
    try {
        await fileStorage.deleteStirlingFile(deletedFileId);
    } catch (error) {
      console.error('Failed to delete files from chain:', error);
    }

    // Refresh to ensure consistent state
    await refreshRecentFiles();
  }, [filteredFiles, onFileRemove, refreshRecentFiles, getSafeFilesToDelete]);

  const handleFileDoubleClick = useCallback((file: StirlingFileStub) => {
    if (isFileSupported(file.name)) {
      onRecentFilesSelected([file]);
      onClose();
    }
  }, [isFileSupported, onRecentFilesSelected, onClose]);

  const handleOpenFiles = useCallback(() => {
    if (selectedFiles.length > 0) {
      onRecentFilesSelected(selectedFiles);
      onClose();
    }
  }, [selectedFiles, onRecentFilesSelected, onClose]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleFileInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      try {
        // For local file uploads, pass File objects directly to FileContext
        onNewFilesSelect(files);
        await refreshRecentFiles();
        onClose();
      } catch (error) {
        console.error('Failed to process selected files:', error);
      }
    }
    event.target.value = '';
  }, [onNewFilesSelect, refreshRecentFiles, onClose]);

  const handleSelectAll = useCallback(() => {
    const allFilesSelected = filteredFiles.length > 0 && selectedFileIds.length === filteredFiles.length;
    if (allFilesSelected) {
      // Deselect all
      setSelectedFileIds([]);
      setLastClickedIndex(null);
    } else {
      // Select all filtered files
      setSelectedFileIds(filteredFiles.map(file => file.id).filter(Boolean));
      setLastClickedIndex(null);
    }
  }, [filteredFiles, selectedFileIds]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedFileIds.length === 0) return;

    try {
      // Delete each selected file using the proven single delete logic
      for (const fileId of selectedFileIds) {
        await handleFileRemoveById(fileId);
      }
    } catch (error) {
      console.error('Failed to delete selected files:', error);
    }
  }, [selectedFileIds, handleFileRemoveById]);


  const handleDownloadSelected = useCallback(async () => {
    if (selectedFileIds.length === 0) return;

    try {
      // Get selected files
      const selectedFilesToDownload = filteredFiles.filter(file =>
        selectedFileIds.includes(file.id)
      );

      // Use generic download utility
      await downloadFiles(selectedFilesToDownload, {
        zipFilename: `selected-files-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.zip`
      });
    } catch (error) {
      console.error('Failed to download selected files:', error);
    }
  }, [selectedFileIds, filteredFiles]);

  const handleDownloadSingle = useCallback(async (file: StirlingFileStub) => {
    try {
      await downloadFiles([file]);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  }, []);

  const handleToggleExpansion = useCallback(async (fileId: FileId) => {
    const isCurrentlyExpanded = expandedFileIds.has(fileId);

    // Update expansion state
    setExpandedFileIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });

    // Load complete history chain if expanding
    if (!isCurrentlyExpanded) {
      const currentFileMetadata = recentFiles.find(f => f.id === fileId);
      if (currentFileMetadata && (currentFileMetadata.versionNumber || 1) > 1) {
        try {
          // Get all stored file metadata for chain traversal
          const allStoredStubs = await fileStorage.getAllStirlingFileStubs();
          const fileMap = new Map(allStoredStubs.map(f => [f.id, f]));

          // Get the current file's IndexedDB data
          const currentStoredStub = fileMap.get(fileId as FileId);
          if (!currentStoredStub) {
            console.warn(`No stored file found for ${fileId}`);
            return;
          }

          // Build complete history chain using IndexedDB metadata
          const historyFiles: StirlingFileStub[] = [];

          // Find the original file

          // Collect only files in this specific branch (ancestors of current file)
          const chainFiles: StirlingFileStub[] = [];
          const allFiles = Array.from(fileMap.values());

          // Build a map for fast parent lookups
          const fileIdMap = new Map<FileId, StirlingFileStub>();
          allFiles.forEach(f => fileIdMap.set(f.id, f));

          // Trace back from current file through parent chain
          let currentFile = fileIdMap.get(fileId);
          while (currentFile?.parentFileId) {
            const parentFile = fileIdMap.get(currentFile.parentFileId);
            if (parentFile) {
              chainFiles.push(parentFile);
              currentFile = parentFile;
            } else {
              break; // Parent not found, stop tracing
            }
          }

          // Sort by version number (oldest first for history display)
          chainFiles.sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1));

          // StirlingFileStubs already have all the data we need - no conversion required!
          historyFiles.push(...chainFiles);

          // Cache the loaded history files
          setLoadedHistoryFiles(prev => new Map(prev.set(fileId as FileId, historyFiles)));
        } catch (error) {
          console.warn(`Failed to load history chain for file ${fileId}:`, error);
        }
      }
    } else {
      // Clear loaded history when collapsing
      setLoadedHistoryFiles(prev => {
        const newMap = new Map(prev);
        newMap.delete(fileId as FileId);
        return newMap;
      });
    }
  }, [expandedFileIds, recentFiles]);

  const handleAddToRecents = useCallback(async (file: StirlingFileStub) => {
    try {
      // Mark the file as a leaf node so it appears in recent files
      await fileStorage.markFileAsLeaf(file.id);

      // Refresh the recent files list to show updated state
      await refreshRecentFiles();
    } catch (error) {
      console.error('Failed to add to recents:', error);
    }
  }, [refreshRecentFiles]);

  const handleGoogleDriveSelect = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      try {
        // Process Google Drive files same as local files
        onNewFilesSelect(files);
        await refreshRecentFiles();
        onClose();
      } catch (error) {
        console.error('Failed to process Google Drive files:', error);
      }
    }
  }, [onNewFilesSelect, refreshRecentFiles, onClose]);

  const handleUnzipFile = useCallback(async (file: StirlingFileStub) => {
    try {
      // Load the full file from storage
      const stirlingFile = await fileStorage.getStirlingFile(file.id);
      if (!stirlingFile) {
        return;
      }

      // Extract and store files using shared service method
      const result = await zipFileService.extractAndStoreFilesWithHistory(stirlingFile, file);

      if (result.success) {
        // Refresh file manager to show new files
        await refreshRecentFiles();
      }

      if (result.errors.length > 0) {
        console.error('Errors during unzip:', result.errors);
      }
    } catch (error) {
      console.error('Failed to unzip file:', error);
    }
  }, [refreshRecentFiles]);

  const handleMakeCopy = useCallback(
    async (file: StirlingFileStub) => {
      if (!file.remoteStorageId) {
        return;
      }
      try {
        const response = await apiClient.get(
          `/api/v1/storage/files/${file.remoteStorageId}/download`,
          { responseType: 'blob', suppressErrorToast: true, skipAuthRedirect: true } as any
        );
        const contentType =
          (response.headers &&
            (response.headers['content-type'] || response.headers['Content-Type'])) ||
          '';
        const disposition =
          (response.headers &&
            (response.headers['content-disposition'] || response.headers['Content-Disposition'])) ||
          '';
        const filename = parseFilename(disposition) || file.name || 'shared-file';
        const blob = response.data as Blob;
        const contentTypeValue = contentType || blob.type;
        const latestFiles = await extractLatestFilesFromBundle(
          blob,
          filename,
          contentTypeValue
        );
        if (latestFiles.length > 0) {
          onNewFilesSelect(latestFiles);
          await refreshRecentFiles();
          alert({
            alertType: 'success',
            title: t('fileManager.copyCreated', 'Copy saved to this device.'),
            expandable: false,
            durationMs: 2500,
          });
        }
      } catch (error) {
        console.error('Failed to create a copy:', error);
        alert({
          alertType: 'error',
          title: t('fileManager.copyFailed', 'Could not create a copy.'),
          expandable: false,
          durationMs: 3500,
        });
      }
    },
    [extractLatestFilesFromBundle, onNewFilesSelect, parseFilename, refreshRecentFiles, t]
  );

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Clean up all created blob URLs
      createdBlobUrls.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      createdBlobUrls.current.clear();
    };
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveSource('recent');
      setStorageFilter('all');
      setSelectedFileIds([]);
      setSearchTerm('');
      setLastClickedIndex(null);
    }
  }, [isOpen]);

  const contextValue: FileManagerContextValue = useMemo(() => ({
    // State
    activeSource,
    storageFilter,
    selectedFileIds,
    searchTerm,
    selectedFiles,
    filteredFiles,
    fileInputRef,
    selectedFilesSet,
    expandedFileIds,
    fileGroups,
    loadedHistoryFiles,
    isLoading,
    activeFileIds,

    // Handlers
    onSourceChange: handleSourceChange,
    onStorageFilterChange: handleStorageFilterChange,
    onLocalFileClick: handleLocalFileClick,
    onFileSelect: handleFileSelect,
    onFileRemove: handleFileRemove,
    onHistoryFileRemove: handleHistoryFileRemove,
    onFileDoubleClick: handleFileDoubleClick,
    onOpenFiles: handleOpenFiles,
    onSearchChange: handleSearchChange,
    onFileInputChange: handleFileInputChange,
    onSelectAll: handleSelectAll,
    onDeleteSelected: handleDeleteSelected,
    onDownloadSelected: handleDownloadSelected,
    onDownloadSingle: handleDownloadSingle,
    onToggleExpansion: handleToggleExpansion,
    onAddToRecents: handleAddToRecents,
    onUnzipFile: handleUnzipFile,
    onMakeCopy: handleMakeCopy,
    onNewFilesSelect,
    onGoogleDriveSelect: handleGoogleDriveSelect,
    refreshRecentFiles,

    // External props
    recentFiles,
    isFileSupported,
    modalHeight,
  }), [
    activeSource,
    storageFilter,
    selectedFileIds,
    searchTerm,
    selectedFiles,
    filteredFiles,
    fileInputRef,
    expandedFileIds,
    fileGroups,
    loadedHistoryFiles,
    isLoading,
    activeFileIds,
    handleSourceChange,
    handleStorageFilterChange,
    handleLocalFileClick,
    handleFileSelect,
    handleFileRemove,
    handleFileRemoveById,
    performFileDelete,
    handleFileDoubleClick,
    handleOpenFiles,
    handleSearchChange,
    handleFileInputChange,
    handleSelectAll,
    handleDeleteSelected,
    handleDownloadSelected,
    handleToggleExpansion,
    handleAddToRecents,
    handleUnzipFile,
    handleMakeCopy,
    onNewFilesSelect,
    handleGoogleDriveSelect,
    recentFiles,
    isFileSupported,
    modalHeight,
    refreshRecentFiles,
  ]);

  return (
    <FileManagerContext.Provider value={contextValue}>
      {children}
      <Modal
        opened={Boolean(deletePromptFile)}
        onClose={() => resolveDeleteChoice('cancel')}
        centered
        title={t('fileManager.removeFileTitle', 'Remove file')}
        zIndex={Z_INDEX_OVER_FILE_MANAGER_MODAL}
      >
        <Stack gap="sm">
          <Text size="sm">
            {deletePromptFile?.remoteOwnedByCurrentUser === false
              ? t(
                  'fileManager.removeSharedPrompt',
                  'This file is shared with you. You can remove it from this device.'
                )
              : t(
                  'fileManager.removeFilePrompt',
                  'This file is saved on this device and on your server. Where would you like to remove it from?'
                )}
          </Text>
          <Text size="sm" c="dimmed">
            {deletePromptFile?.name}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => resolveDeleteChoice('cancel')}>
              {t('cancel', 'Cancel')}
            </Button>
            <Button variant="light" onClick={() => resolveDeleteChoice('local')}>
              {t('fileManager.removeLocalOnly', 'This device only')}
            </Button>
            {deletePromptFile?.remoteOwnedByCurrentUser !== false && (
              <>
                <Button variant="light" onClick={() => resolveDeleteChoice('server')}>
                  {t('fileManager.removeServerOnly', 'Server only')}
                </Button>
                <Button color="red" onClick={() => resolveDeleteChoice('both')}>
                  {t('fileManager.removeBoth', 'Remove from both')}
                </Button>
              </>
            )}
          </Group>
        </Stack>
      </Modal>
    </FileManagerContext.Provider>
  );
};

// Custom hook to use the context
export const useFileManagerContext = (): FileManagerContextValue => {
  const context = useContext(FileManagerContext);

  if (!context) {
    throw new Error(
      'useFileManagerContext must be used within a FileManagerProvider. ' +
      'Make sure you wrap your component with <FileManagerProvider>.'
    );
  }

  return context;
};

// Export the context for advanced use cases
export { FileManagerContext };
