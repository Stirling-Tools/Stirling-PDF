import React, { createContext, useContext, useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { FileMetadata } from '../types/file';
import { StoredFile } from '../services/fileStorage';

// Type for the context value - now contains everything directly
interface FileManagerContextValue {
  // State
  activeSource: 'recent' | 'local' | 'drive';
  selectedFileIds: string[];
  searchTerm: string;
  selectedFiles: FileMetadata[];
  filteredFiles: FileMetadata[];
  fileInputRef: React.RefObject<HTMLInputElement | null>;

  // Handlers
  onSourceChange: (source: 'recent' | 'local' | 'drive') => void;
  onLocalFileClick: () => void;
  onFileSelect: (file: FileMetadata) => void;
  onFileRemove: (index: number) => void;
  onFileDoubleClick: (file: FileMetadata) => void;
  onOpenFiles: () => void;
  onSearchChange: (value: string) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;

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
  storeFile: (file: File, fileId: string) => Promise<StoredFile>;
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
  storeFile,
  refreshRecentFiles,
}) => {
  const [activeSource, setActiveSource] = useState<'recent' | 'local' | 'drive'>('recent');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track blob URLs for cleanup
  const createdBlobUrls = useRef<Set<string>>(new Set());

  // Computed values (with null safety)
  const selectedFiles = (recentFiles || []).filter(file => selectedFileIds.includes(file.id || file.name));
  const filteredFiles = (recentFiles || []).filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSourceChange = useCallback((source: 'recent' | 'local' | 'drive') => {
    setActiveSource(source);
    if (source !== 'recent') {
      setSelectedFileIds([]);
      setSearchTerm('');
    }
  }, []);

  const handleLocalFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((file: FileMetadata) => {
    setSelectedFileIds(prev => {
      if (file.id) {
        if (prev.includes(file.id)) {
          return prev.filter(id => id !== file.id);
        } else {
          return [...prev, file.id];
        }
      } else {
        return prev;
      }
    });
  }, []);

  const handleFileRemove = useCallback((index: number) => {
    const fileToRemove = filteredFiles[index];
    if (fileToRemove) {
      setSelectedFileIds(prev => prev.filter(id => id !== fileToRemove.id));
    }
    onFileRemove(index);
  }, [filteredFiles, onFileRemove]);

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

    // Handlers
    onSourceChange: handleSourceChange,
    onLocalFileClick: handleLocalFileClick,
    onFileSelect: handleFileSelect,
    onFileRemove: handleFileRemove,
    onFileDoubleClick: handleFileDoubleClick,
    onOpenFiles: handleOpenFiles,
    onSearchChange: handleSearchChange,
    onFileInputChange: handleFileInputChange,

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
    handleSourceChange,
    handleLocalFileClick,
    handleFileSelect,
    handleFileRemove,
    handleFileDoubleClick,
    handleOpenFiles,
    handleSearchChange,
    handleFileInputChange,
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
