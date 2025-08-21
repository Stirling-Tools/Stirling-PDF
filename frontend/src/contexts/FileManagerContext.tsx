import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { FileWithUrl } from '../types/file';
import { StoredFile, fileStorage } from '../services/fileStorage';
import { downloadFiles } from '../utils/downloadUtils';

// Type for the context value - now contains everything directly
interface FileManagerContextValue {
  // State
  activeSource: 'recent' | 'local' | 'drive';
  selectedFileIds: string[];
  searchTerm: string;
  selectedFiles: FileWithUrl[];
  filteredFiles: FileWithUrl[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  selectedFilesSet: Set<string>;

  // Handlers
  onSourceChange: (source: 'recent' | 'local' | 'drive') => void;
  onLocalFileClick: () => void;
  onFileSelect: (file: FileWithUrl, index: number, shiftKey?: boolean) => void;
  onFileRemove: (index: number) => void;
  onFileDoubleClick: (file: FileWithUrl) => void;
  onOpenFiles: () => void;
  onSearchChange: (value: string) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onDownloadSelected: () => void;
  onDownloadSingle: (file: FileWithUrl) => void;

  // External props
  recentFiles: FileWithUrl[];
  isFileSupported: (fileName: string) => boolean;
  modalHeight: string;
}

// Create the context
const FileManagerContext = createContext<FileManagerContextValue | null>(null);

// Provider component props
interface FileManagerProviderProps {
  children: React.ReactNode;
  recentFiles: FileWithUrl[];
  onFilesSelected: (files: FileWithUrl[]) => void;
  onClose: () => void;
  isFileSupported: (fileName: string) => boolean;
  isOpen: boolean;
  onFileRemove: (index: number) => void;
  modalHeight: string;
  storeFile: (file: File) => Promise<StoredFile>;
  refreshRecentFiles: () => Promise<void>;
}

export const FileManagerProvider: React.FC<FileManagerProviderProps> = ({
  children,
  recentFiles,
  onFilesSelected,
  onClose,
  isFileSupported,
  isOpen,
  onFileRemove,
  modalHeight,
  storeFile,
  refreshRecentFiles,
}) => {
  const [activeSource, setActiveSource] = useState<'recent' | 'local' | 'drive'>('recent');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track blob URLs for cleanup
  const createdBlobUrls = useRef<Set<string>>(new Set());

  // Computed values (with null safety)
  const selectedFilesSet = new Set(selectedFileIds);
  
  const selectedFiles = selectedFileIds.length === 0 ? [] : 
    (recentFiles || []).filter(file => selectedFilesSet.has(file.id || file.name));
  
  const filteredFiles = !searchTerm ? recentFiles || [] :
    (recentFiles || []).filter(file =>
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

  const handleFileSelect = useCallback((file: FileWithUrl, currentIndex: number, shiftKey?: boolean) => {
    const fileId = file.id || file.name;
    if (!fileId) return;
    
    if (shiftKey && lastClickedIndex !== null) {
      // Range selection with shift-click
      const startIndex = Math.min(lastClickedIndex, currentIndex);
      const endIndex = Math.max(lastClickedIndex, currentIndex);
      
      setSelectedFileIds(prev => {
        const selectedSet = new Set(prev);
        
        // Add all files in the range to selection
        for (let i = startIndex; i <= endIndex; i++) {
          const rangeFileId = filteredFiles[i]?.id || filteredFiles[i]?.name;
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

  const handleFileRemove = useCallback((index: number) => {
    const fileToRemove = filteredFiles[index];
    if (fileToRemove) {
      setSelectedFileIds(prev => prev.filter(id => id !== fileToRemove.id));
    }
    onFileRemove(index);
  }, [filteredFiles, onFileRemove]);

  const handleFileDoubleClick = useCallback((file: FileWithUrl) => {
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
        // Create FileWithUrl objects - FileContext will handle storage and ID assignment
        const fileWithUrls = files.map(file => {
          const url = URL.createObjectURL(file);
          createdBlobUrls.current.add(url);

          return {
            // No ID assigned here - FileContext will handle storage and ID assignment
            name: file.name,
            file,
            url,
            size: file.size,
            lastModified: file.lastModified,
          };
        });

        onFilesSelected(fileWithUrls as any /* FIX ME */);
        await refreshRecentFiles();
        onClose();
      } catch (error) {
        console.error('Failed to process selected files:', error);
      }
    }
    event.target.value = '';
  }, [storeFile, onFilesSelected, refreshRecentFiles, onClose]);

  const handleSelectAll = useCallback(() => {
    const allFilesSelected = filteredFiles.length > 0 && selectedFileIds.length === filteredFiles.length;
    if (allFilesSelected) {
      // Deselect all
      setSelectedFileIds([]);
      setLastClickedIndex(null);
    } else {
      // Select all filtered files
      setSelectedFileIds(filteredFiles.map(file => file.id || file.name));
      setLastClickedIndex(null);
    }
  }, [filteredFiles, selectedFileIds]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedFileIds.length === 0) return;

    try {
      // Get files to delete based on current filtered view
      const filesToDelete = filteredFiles.filter(file => 
        selectedFileIds.includes(file.id || file.name)
      );

      // Delete files from storage
      for (const file of filesToDelete) {
        const lookupKey = file.id || file.name;
        await fileStorage.deleteFile(lookupKey);
      }

      // Clear selection
      setSelectedFileIds([]);

      // Refresh the file list
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
        selectedFileIds.includes(file.id || file.name)
      );

      // Use generic download utility
      await downloadFiles(selectedFilesToDownload, {
        zipFilename: `selected-files-${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.zip`
      });
    } catch (error) {
      console.error('Failed to download selected files:', error);
    }
  }, [selectedFileIds, filteredFiles]);

  const handleDownloadSingle = useCallback(async (file: FileWithUrl) => {
    try {
      await downloadFiles([file]);
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  }, []);


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

  const contextValue: FileManagerContextValue = {
    // State
    activeSource,
    selectedFileIds,
    searchTerm,
    selectedFiles,
    filteredFiles,
    fileInputRef,
    selectedFilesSet,

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

    // External props
    recentFiles,
    isFileSupported,
    modalHeight,
  };

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
