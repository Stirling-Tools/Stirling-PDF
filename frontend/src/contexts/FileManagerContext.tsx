import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FileMetadata } from '../types/file';
import { fileStorage } from '../services/fileStorage';
import { downloadFiles } from '../utils/downloadUtils';
import { FileId } from '../types/file';
import { getLatestVersions, groupFilesByOriginal, getVersionHistory, createFileMetadataWithHistory } from '../utils/fileHistoryUtils';
import { useMultiFileHistory } from '../hooks/useFileHistory';

// Type for the context value - now contains everything directly
interface FileManagerContextValue {
  // State
  activeSource: 'recent' | 'local' | 'drive';
  selectedFileIds: FileId[];
  searchTerm: string;
  selectedFiles: FileMetadata[];
  filteredFiles: FileMetadata[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFilesSet: Set<string>;
  expandedFileIds: Set<string>;
  fileGroups: Map<string, FileMetadata[]>;

  // History loading state
  isLoadingHistory: (fileId: FileId) => boolean;
  getHistoryError: (fileId: FileId) => string | null;

  // Handlers
  onSourceChange: (source: 'recent' | 'local' | 'drive') => void;
  onLocalFileClick: () => void;
  onFileSelect: (file: FileMetadata, index: number, shiftKey?: boolean) => void;
  onFileRemove: (index: number) => void;
  onFileDoubleClick: (file: FileMetadata) => void;
  onOpenFiles: () => void;
  onSearchChange: (value: string) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onDownloadSelected: () => void;
  onDownloadSingle: (file: FileMetadata) => void;
  onToggleExpansion: (fileId: string) => void;
  onAddToRecents: (file: FileMetadata) => void;
  onNewFilesSelect: (files: File[]) => void;

  // External props
  recentFiles: FileMetadata[];
  isFileSupported: (fileName: string) => boolean;
  modalHeight: string;
}

// Create the context
const FileManagerContext = createContext<FileManagerContextValue | null>(null);

// Provider component props
interface FileManagerProviderProps {
  children: React.ReactNode;
  recentFiles: FileMetadata[];
  onFilesSelected: (files: FileMetadata[]) => void; // For selecting stored files
  onNewFilesSelect: (files: File[]) => void; // For uploading new local files
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
  const [loadedHistoryFiles, setLoadedHistoryFiles] = useState<Map<FileId, FileMetadata[]>>(new Map()); // Cache for loaded history
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track blob URLs for cleanup
  const createdBlobUrls = useRef<Set<string>>(new Set());

  // History loading hook
  const {
    loadFileHistory,
    getHistory,
    isLoadingHistory,
    getError: getHistoryError
  } = useMultiFileHistory();

  // Computed values (with null safety)
  const selectedFilesSet = new Set(selectedFileIds);

  // Group files by original file ID for version management
  const fileGroups = useMemo(() => {
    if (!recentFiles || recentFiles.length === 0) return new Map();
    
    // Convert FileMetadata to FileRecord-like objects for grouping utility
    const recordsForGrouping = recentFiles.map(file => ({
      ...file,
      originalFileId: file.originalFileId,
      versionNumber: file.versionNumber || 0
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
        const sortedHistory = historyFiles.sort((a, b) => (a.versionNumber || 0) - (b.versionNumber || 0));
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

  const handleFileSelect = useCallback((file: FileMetadata, currentIndex: number, shiftKey?: boolean) => {
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

  const handleFileRemove = useCallback(async (index: number) => {
    const fileToRemove = filteredFiles[index];
    if (fileToRemove) {
      const deletedFileId = fileToRemove.id;
      
      // Clear from selection immediately
      setSelectedFileIds(prev => prev.filter(id => id !== deletedFileId));
      
      // Clear from expanded state to prevent ghost entries
      setExpandedFileIds(prev => {
        const newExpanded = new Set(prev);
        newExpanded.delete(deletedFileId);
        return newExpanded;
      });
      
      // Clear from history cache - need to remove this file from any cached history
      setLoadedHistoryFiles(prev => {
        const newCache = new Map(prev);
        
        // If the deleted file was a main file with cached history, remove its cache
        newCache.delete(deletedFileId);
        
        // Also remove the deleted file from any other file's history cache
        for (const [mainFileId, historyFiles] of newCache.entries()) {
          const filteredHistory = historyFiles.filter(histFile => histFile.id !== deletedFileId);
          if (filteredHistory.length !== historyFiles.length) {
            // The deleted file was in this history, update the cache
            newCache.set(mainFileId, filteredHistory);
          }
        }
        
        return newCache;
      });

      // Call the parent's deletion logic
      await onFileRemove(index);
      
      // Refresh to ensure consistent state
      await refreshRecentFiles();
    }
  }, [filteredFiles, onFileRemove, refreshRecentFiles]);

  const handleFileDoubleClick = useCallback((file: FileMetadata) => {
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
      // Use the same logic as individual file deletion for consistency
      // Delete each selected file individually using the same cache update logic
      const allFilesToDelete = filteredFiles.filter(file =>
        selectedFileIds.includes(file.id)
      );
      
      // Deduplicate by file ID since shared files can appear multiple times in the display
      const uniqueFilesToDelete = allFilesToDelete.reduce((unique: typeof allFilesToDelete, file) => {
        if (!unique.some(f => f.id === file.id)) {
          unique.push(file);
        }
        return unique;
      }, []);
      
      const filesToDelete = uniqueFilesToDelete;
      const deletedFileIds = new Set(filesToDelete.map(f => f.id));

      // Update history cache synchronously
      setLoadedHistoryFiles(prev => {
        const newCache = new Map(prev);
        
        for (const fileToDelete of filesToDelete) {
          // If the deleted file was a main file with cached history, remove its cache
          newCache.delete(fileToDelete.id);
          
          // Also remove the deleted file from any other file's history cache
          for (const [mainFileId, historyFiles] of newCache.entries()) {
            const filteredHistory = historyFiles.filter(histFile => histFile.id !== fileToDelete.id);
            if (filteredHistory.length !== historyFiles.length) {
              // The deleted file was in this history, update the cache
              newCache.set(mainFileId, filteredHistory);
            }
          }
        }
        
        return newCache;
      });

      // Also clear any expanded state for deleted files to prevent ghost entries
      setExpandedFileIds(prev => {
        const newExpanded = new Set(prev);
        for (const deletedId of deletedFileIds) {
          newExpanded.delete(deletedId);
        }
        return newExpanded;
      });

      // Clear selection immediately to prevent ghost selections
      setSelectedFileIds(prev => prev.filter(id => !deletedFileIds.has(id)));

      // Delete files from IndexedDB
      for (const file of filesToDelete) {
        await fileStorage.deleteFile(file.id);
      }

      // Refresh the file list to get updated data
      await refreshRecentFiles();
    } catch (error) {
      console.error('Failed to delete selected files:', error);
    }
  }, [selectedFileIds, filteredFiles, refreshRecentFiles]);


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

  const handleDownloadSingle = useCallback(async (file: FileMetadata) => {
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
      if (currentFileMetadata && (currentFileMetadata.versionNumber || 0) > 0) {
        try {
          // Load the current file to get its full history
          const storedFile = await fileStorage.getFile(fileId as FileId);
          if (storedFile) {
            const file = new File([storedFile.data], storedFile.name, {
              type: storedFile.type,
              lastModified: storedFile.lastModified
            });
            
            // Get the complete history metadata (this will give us original/parent IDs)
            const historyData = await loadFileHistory(file, fileId as FileId);
            
            if (historyData?.originalFileId) {
              // Load complete history chain by traversing parent relationships
              const historyFiles: FileMetadata[] = [];
              
              // Get all stored files for chain traversal
              const allStoredMetadata = await fileStorage.getAllFileMetadata();
              const fileMap = new Map(allStoredMetadata.map(f => [f.id, f]));
              
              // Build complete chain by following parent relationships backwards
              const visitedIds = new Set([fileId]); // Don't include the current file
              const toProcess = [historyData]; // Start with current file's history data
              
              while (toProcess.length > 0) {
                const currentHistoryData = toProcess.shift()!;
                
                // Add original file if we haven't seen it
                if (currentHistoryData.originalFileId && !visitedIds.has(currentHistoryData.originalFileId)) {
                  visitedIds.add(currentHistoryData.originalFileId);
                  const originalMeta = fileMap.get(currentHistoryData.originalFileId as FileId);
                  if (originalMeta) {
                    try {
                      const origStoredFile = await fileStorage.getFile(originalMeta.id);
                      if (origStoredFile) {
                        const origFile = new File([origStoredFile.data], origStoredFile.name, {
                          type: origStoredFile.type,
                          lastModified: origStoredFile.lastModified
                        });
                        const origMetadata = await createFileMetadataWithHistory(origFile, originalMeta.id, originalMeta.thumbnail);
                        historyFiles.push(origMetadata);
                      }
                    } catch (error) {
                      console.warn(`Failed to load original file ${originalMeta.id}:`, error);
                    }
                  }
                }
                
                // Add parent file if we haven't seen it
                if (currentHistoryData.parentFileId && !visitedIds.has(currentHistoryData.parentFileId)) {
                  visitedIds.add(currentHistoryData.parentFileId);
                  const parentMeta = fileMap.get(currentHistoryData.parentFileId);
                  if (parentMeta) {
                    try {
                      const parentStoredFile = await fileStorage.getFile(parentMeta.id);
                      if (parentStoredFile) {
                        const parentFile = new File([parentStoredFile.data], parentStoredFile.name, {
                          type: parentStoredFile.type,
                          lastModified: parentStoredFile.lastModified
                        });
                        const parentMetadata = await createFileMetadataWithHistory(parentFile, parentMeta.id, parentMeta.thumbnail);
                        historyFiles.push(parentMetadata);
                        
                        // Load parent's history to continue the chain
                        const parentHistoryData = await loadFileHistory(parentFile, parentMeta.id);
                        if (parentHistoryData) {
                          toProcess.push(parentHistoryData);
                        }
                      }
                    } catch (error) {
                      console.warn(`Failed to load parent file ${parentMeta.id}:`, error);
                    }
                  }
                }
              }
              
              // Also find any files that have the current file as their original (siblings/alternatives)
              for (const [metaId, meta] of fileMap) {
                if (!visitedIds.has(metaId) && (meta as any).originalFileId === historyData.originalFileId) {
                  visitedIds.add(metaId);
                  try {
                    const siblingStoredFile = await fileStorage.getFile(meta.id);
                    if (siblingStoredFile) {
                      const siblingFile = new File([siblingStoredFile.data], siblingStoredFile.name, {
                        type: siblingStoredFile.type,
                        lastModified: siblingStoredFile.lastModified
                      });
                      const siblingMetadata = await createFileMetadataWithHistory(siblingFile, meta.id, meta.thumbnail);
                      historyFiles.push(siblingMetadata);
                    }
                  } catch (error) {
                    console.warn(`Failed to load sibling file ${meta.id}:`, error);
                  }
                }
              }
              
              // Cache the loaded history files
              setLoadedHistoryFiles(prev => new Map(prev.set(fileId as FileId, historyFiles)));
            }
          }
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
  }, [expandedFileIds, recentFiles, loadFileHistory]);

  const handleAddToRecents = useCallback(async (file: FileMetadata) => {
    try {
      console.log('Promoting to recents:', file.name, 'version:', file.versionNumber);
      
      // Load the file from storage and create a copy with new ID and timestamp
      const storedFile = await fileStorage.getFile(file.id);
      if (storedFile) {
        // Create new file with current timestamp to appear at top
        const promotedFile = new File([storedFile.data], file.name, {
          type: file.type,
          lastModified: Date.now() // Current timestamp makes it appear at top
        });
        
        // Add as new file through the normal flow (creates new ID)
        onNewFilesSelect([promotedFile]);
        
        console.log('Successfully promoted to recents:', file.name, 'v' + file.versionNumber);
      }
    } catch (error) {
      console.error('Failed to promote to recents:', error);
    }
  }, [onNewFilesSelect]);

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

    // History loading state
    isLoadingHistory,
    getHistoryError,

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
    isLoadingHistory,
    getHistoryError,
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
