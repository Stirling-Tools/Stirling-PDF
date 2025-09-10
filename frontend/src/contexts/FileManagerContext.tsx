import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { StoredFileMetadata, StoredFile } from '../services/fileStorage';
import { fileStorage } from '../services/fileStorage';
import { downloadFiles } from '../utils/downloadUtils';
import { FileId } from '../types/file';
import { groupFilesByOriginal } from '../utils/fileHistoryUtils';

// Type for the context value - now contains everything directly
interface FileManagerContextValue {
  // State
  activeSource: 'recent' | 'local' | 'drive';
  selectedFileIds: FileId[];
  searchTerm: string;
  selectedFiles: StoredFileMetadata[];
  filteredFiles: StoredFileMetadata[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFilesSet: Set<string>;
  expandedFileIds: Set<string>;
  fileGroups: Map<string, StoredFileMetadata[]>;

  // Handlers
  onSourceChange: (source: 'recent' | 'local' | 'drive') => void;
  onLocalFileClick: () => void;
  onFileSelect: (file: StoredFileMetadata, index: number, shiftKey?: boolean) => void;
  onFileRemove: (index: number) => void;
  onFileDoubleClick: (file: StoredFileMetadata) => void;
  onOpenFiles: () => void;
  onSearchChange: (value: string) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onDownloadSelected: () => void;
  onDownloadSingle: (file: StoredFileMetadata) => void;
  onToggleExpansion: (fileId: string) => void;
  onAddToRecents: (file: StoredFileMetadata) => void;
  onNewFilesSelect: (files: File[]) => void;

  // External props
  recentFiles: StoredFileMetadata[];
  isFileSupported: (fileName: string) => boolean;
  modalHeight: string;
}

// Create the context
const FileManagerContext = createContext<FileManagerContextValue | null>(null);

// Provider component props
interface FileManagerProviderProps {
  children: React.ReactNode;
  recentFiles: StoredFileMetadata[];
  onFilesSelected: (files: StoredFileMetadata[]) => void; // For selecting stored files
  onNewFilesSelect: (files: File[]) => void; // For uploading new local files
  onStoredFilesSelect: (storedFiles: StoredFile[]) => void; // For adding stored files directly
  onClose: () => void;
  isFileSupported: (fileName: string) => boolean;
  isOpen: boolean;
  onFileRemove: (index: number) => void;
  modalHeight: string;
  refreshRecentFiles: () => Promise<void>;
}

export const FileManagerProvider: React.FC<FileManagerProviderProps> = ({
  children,
  recentFiles,
  onFilesSelected,
  onNewFilesSelect,
  onStoredFilesSelect: onStoredFilesSelect,
  onClose,
  isFileSupported,
  isOpen,
  onFileRemove,
  modalHeight,
  refreshRecentFiles,
}) => {
  const [activeSource, setActiveSource] = useState<'recent' | 'local' | 'drive'>('recent');
  const [selectedFileIds, setSelectedFileIds] = useState<FileId[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [expandedFileIds, setExpandedFileIds] = useState<Set<string>>(new Set());
  const [loadedHistoryFiles, setLoadedHistoryFiles] = useState<Map<FileId, StoredFileMetadata[]>>(new Map()); // Cache for loaded history
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track blob URLs for cleanup
  const createdBlobUrls = useRef<Set<string>>(new Set());


  // Computed values (with null safety)
  const selectedFilesSet = new Set(selectedFileIds);

  // Group files by original file ID for version management
  const fileGroups = useMemo(() => {
    if (!recentFiles || recentFiles.length === 0) return new Map();

    // Convert StoredFileMetadata to FileRecord-like objects for grouping utility
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

    const expandedFiles = [];

    // Since we now only load leaf files, iterate through recent files directly
    for (const leafFile of recentFiles) {
      // Add the leaf file (main file shown in list)
      expandedFiles.push(leafFile);

      // If expanded, add the loaded history files
      if (expandedFileIds.has(leafFile.id)) {
        const historyFiles = loadedHistoryFiles.get(leafFile.id) || [];
        // Sort history files by version number (oldest first)
        const sortedHistory = historyFiles.sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1));
        expandedFiles.push(...sortedHistory);
      }
    }

    return expandedFiles;
  }, [recentFiles, expandedFileIds, loadedHistoryFiles]);

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

  const handleLocalFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((file: StoredFileMetadata, currentIndex: number, shiftKey?: boolean) => {
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
    leafFileIds: string[],
    allStoredMetadata: Omit<import('../services/fileStorage').StoredFile, 'data'>[]
  ): string[] => {
    const fileMap = new Map(allStoredMetadata.map(f => [f.id as string, f]));
    const filesToDelete = new Set<string>();
    const filesToPreserve = new Set<string>();

    // First, identify all files in the lineages of the leaf files being deleted
    for (const leafFileId of leafFileIds) {
      const currentFile = fileMap.get(leafFileId);
      if (!currentFile) continue;

      // Always include the leaf file itself for deletion
      filesToDelete.add(leafFileId);

      // If this is a processed file with history, trace back through its lineage
      if (currentFile.versionNumber && currentFile.versionNumber > 1) {
        const originalFileId = currentFile.originalFileId || currentFile.id;

        // Find all files in this history chain
        const chainFiles = allStoredMetadata.filter(file =>
          (file.originalFileId || file.id) === originalFileId
        );

        // Add all files in this lineage as candidates for deletion
        chainFiles.forEach(file => filesToDelete.add(file.id));
      }
    }

    // Now identify files that must be preserved because they're referenced by OTHER lineages
    for (const file of allStoredMetadata) {
      const fileOriginalId = file.originalFileId || file.id;

      // If this file is a leaf node (not being deleted) and its lineage overlaps with files we want to delete
      if (file.isLeaf !== false && !leafFileIds.includes(file.id)) {
        // Find all files in this preserved lineage
        const preservedChainFiles = allStoredMetadata.filter(chainFile =>
          (chainFile.originalFileId || chainFile.id) === fileOriginalId
        );

        // Mark all files in this preserved lineage as must-preserve
        preservedChainFiles.forEach(chainFile => filesToPreserve.add(chainFile.id));
      }
    }

    // Final list: files to delete minus files that must be preserved
    const safeToDelete = Array.from(filesToDelete).filter(fileId => !filesToPreserve.has(fileId));

    console.log('Deletion analysis:', {
      candidatesForDeletion: Array.from(filesToDelete),
      mustPreserve: Array.from(filesToPreserve),
      safeToDelete
    });

    return safeToDelete;
  }, []);

  const handleFileRemove = useCallback(async (index: number) => {
    const fileToRemove = filteredFiles[index];
    if (fileToRemove) {
      const deletedFileId = fileToRemove.id;

      // Get all stored files to analyze lineages
      const allStoredMetadata = await fileStorage.getAllFileMetadata();

      // Get safe files to delete (respecting shared lineages)
      const filesToDelete = getSafeFilesToDelete([deletedFileId as string], allStoredMetadata);

      console.log(`Safely deleting files for ${fileToRemove.name}:`, filesToDelete);

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
          const filteredHistory = historyFiles.filter(histFile => !filesToDelete.includes(histFile.id as string));
          if (filteredHistory.length !== historyFiles.length) {
            newCache.set(mainFileId, filteredHistory);
          }
        }

        return newCache;
      });

      // Delete safe files from IndexedDB
      try {
        for (const fileId of filesToDelete) {
          await fileStorage.deleteFile(fileId as FileId);
        }
      } catch (error) {
        console.error('Failed to delete files from chain:', error);
      }

      // Call the parent's deletion logic for the main file only
      await onFileRemove(index);

      // Refresh to ensure consistent state
      await refreshRecentFiles();
    }
  }, [filteredFiles, onFileRemove, refreshRecentFiles, getSafeFilesToDelete]);

  const handleFileDoubleClick = useCallback((file: StoredFileMetadata) => {
    if (isFileSupported(file.name)) {
      onFilesSelected([file]);
      onClose();
    }
  }, [isFileSupported, onFilesSelected, onClose]);

  const handleOpenFiles = useCallback(() => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
      onClose();
    }
  }, [selectedFiles, onFilesSelected, onClose]);

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
      // Get all stored files to analyze lineages
      const allStoredMetadata = await fileStorage.getAllFileMetadata();

      // Get safe files to delete (respecting shared lineages)
      const filesToDelete = getSafeFilesToDelete(selectedFileIds, allStoredMetadata);

      console.log(`Bulk safely deleting files and their history chains:`, filesToDelete);

      // Update history cache synchronously
      setLoadedHistoryFiles(prev => {
        const newCache = new Map(prev);

        // Remove cache entries for all deleted files
        filesToDelete.forEach(id => newCache.delete(id as FileId));

        // Also remove deleted files from any other file's history cache
        for (const [mainFileId, historyFiles] of newCache.entries()) {
          const filteredHistory = historyFiles.filter(histFile => !filesToDelete.includes(histFile.id as string));
          if (filteredHistory.length !== historyFiles.length) {
            newCache.set(mainFileId, filteredHistory);
          }
        }

        return newCache;
      });

      // Also clear any expanded state for deleted files to prevent ghost entries
      setExpandedFileIds(prev => {
        const newExpanded = new Set(prev);
        filesToDelete.forEach(id => newExpanded.delete(id));
        return newExpanded;
      });

      // Clear selection immediately to prevent ghost selections
      setSelectedFileIds(prev => prev.filter(id => !filesToDelete.includes(id)));

      // Delete safe files from IndexedDB
      for (const fileId of filesToDelete) {
        await fileStorage.deleteFile(fileId as FileId);
      }

      // Refresh the file list to get updated data
      await refreshRecentFiles();
    } catch (error) {
      console.error('Failed to delete selected files:', error);
    }
  }, [selectedFileIds, filteredFiles, refreshRecentFiles, getSafeFilesToDelete]);


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

  const handleDownloadSingle = useCallback(async (file: StoredFileMetadata) => {
    try {
      await downloadFiles([file]);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  }, []);

  const handleToggleExpansion = useCallback(async (fileId: string) => {
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
          const allStoredMetadata = await fileStorage.getAllFileMetadata();
          const fileMap = new Map(allStoredMetadata.map(f => [f.id, f]));

          // Get the current file's IndexedDB data
          const currentStoredFile = fileMap.get(fileId as FileId);
          if (!currentStoredFile) {
            console.warn(`No stored file found for ${fileId}`);
            return;
          }

          // Build complete history chain using IndexedDB metadata
          const historyFiles: StoredFileMetadata[] = [];

          // Find the original file
          const originalFileId = currentStoredFile.originalFileId || currentStoredFile.id;

          // Collect all files in this history chain
          const chainFiles = Array.from(fileMap.values()).filter(file =>
            (file.originalFileId || file.id) === originalFileId && file.id !== fileId
          );

          // Sort by version number (oldest first for history display)
          chainFiles.sort((a, b) => (a.versionNumber || 1) - (b.versionNumber || 1));

          // Convert stored files to StoredFileMetadata format with proper history info
          for (const storedFile of chainFiles) {
              // Load the actual file to extract PDF metadata if available
              const historyMetadata: StoredFileMetadata = {
                id: storedFile.id,
                name: storedFile.name,
                type: storedFile.type,
                size: storedFile.size,
                lastModified: storedFile.lastModified,
                thumbnail: storedFile.thumbnail,
                versionNumber: storedFile.versionNumber,
                isLeaf: storedFile.isLeaf,
                // Use IndexedDB data directly - it's more reliable than re-parsing PDF
                originalFileId: storedFile.originalFileId,
                parentFileId: storedFile.parentFileId,
                toolHistory: storedFile.toolHistory
              };
              historyFiles.push(historyMetadata);
          }

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

  const handleAddToRecents = useCallback(async (file: StoredFileMetadata) => {
    try {
      console.log('Adding to recents:', file.name, 'version:', file.versionNumber);

      // Load file from storage and use addStoredFiles pattern
      const storedFile = await fileStorage.getFile(file.id);
      if (!storedFile) {
        throw new Error(`File not found in storage: ${file.name}`);
      }

      // Use direct StoredFile approach - much more efficient
      onStoredFilesSelect([storedFile]);

      console.log('Successfully added to recents:', file.name, 'v' + file.versionNumber);
    } catch (error) {
      console.error('Failed to add to recents:', error);
    }
  }, [onStoredFilesSelect]);

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
      setSelectedFileIds([]);
      setSearchTerm('');
      setLastClickedIndex(null);
    }
  }, [isOpen]);

  const contextValue: FileManagerContextValue = useMemo(() => ({
    // State
    activeSource,
    selectedFileIds,
    searchTerm,
    selectedFiles,
    filteredFiles,
    fileInputRef,
    selectedFilesSet,
    expandedFileIds,
    fileGroups,

    // Handlers
    onSourceChange: handleSourceChange,
    onLocalFileClick: handleLocalFileClick,
    onFileSelect: handleFileSelect,
    onFileRemove: handleFileRemove,
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
    onNewFilesSelect,

    // External props
    recentFiles,
    isFileSupported,
    modalHeight,
  }), [
    activeSource,
    selectedFileIds,
    searchTerm,
    selectedFiles,
    filteredFiles,
    fileInputRef,
    expandedFileIds,
    fileGroups,
    handleSourceChange,
    handleLocalFileClick,
    handleFileSelect,
    handleFileRemove,
    handleFileDoubleClick,
    handleOpenFiles,
    handleSearchChange,
    handleFileInputChange,
    handleSelectAll,
    handleDeleteSelected,
    handleDownloadSelected,
    handleToggleExpansion,
    handleAddToRecents,
    onNewFilesSelect,
    recentFiles,
    isFileSupported,
    modalHeight,
  ]);

  return (
    <FileManagerContext.Provider value={contextValue}>
      {children}
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
