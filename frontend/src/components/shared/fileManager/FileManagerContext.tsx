import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { FileWithUrl } from '../../../types/file';
import { FileSource } from './types';

// Type for the context value - now contains everything directly
interface FileManagerContextValue {
  // State
  activeSource: FileSource;
  selectedFileIds: string[];
  searchTerm: string;
  selectedFiles: FileWithUrl[];
  filteredFiles: FileWithUrl[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  
  // Handlers
  onSourceChange: (source: FileSource) => void;
  onLocalFileClick: () => void;
  onFileSelect: (file: FileWithUrl) => void;
  onFileRemove: (index: number) => void;
  onFileDoubleClick: (file: FileWithUrl) => void;
  onOpenFiles: () => void;
  onSearchChange: (value: string) => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  
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
}) => {
  const [activeSource, setActiveSource] = useState<FileSource>('recent');
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Track blob URLs for cleanup
  const createdBlobUrls = useRef<Set<string>>(new Set());

  // Computed values (with null safety)
  const selectedFiles = (recentFiles || []).filter(file => selectedFileIds.includes(file.id));
  const filteredFiles = (recentFiles || []).filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSourceChange = useCallback((source: FileSource) => {
    setActiveSource(source);
    if (source !== 'recent') {
      setSelectedFileIds([]);
      setSearchTerm('');
    }
  }, []);

  const handleLocalFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback((file: FileWithUrl) => {
    setSelectedFileIds(prev => {
      if (prev.includes(file.id)) {
        return prev.filter(id => id !== file.id);
      } else {
        return [...prev, file.id];
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

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      const fileWithUrls = files.map(file => {
        const url = URL.createObjectURL(file);
        createdBlobUrls.current.add(url);
        return {
          id: `local-${Date.now()}-${Math.random()}`,
          name: file.name,
          file,
          url,
          size: file.size,
          lastModified: file.lastModified,
        };
      });
      onFilesSelected(fileWithUrls);
      onClose();
    }
    event.target.value = '';
  }, [onFilesSelected, onClose]);

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

  const contextValue: FileManagerContextValue = {
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