import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useFileHandler } from '../hooks/useFileHandler';
import { FileMetadata } from '../types/file';

interface FilesModalContextType {
  isFilesModalOpen: boolean;
  openFilesModal: (options?: { insertAfterPage?: number; customHandler?: (files: File[], insertAfterPage?: number) => void }) => void;
  closeFilesModal: () => void;
  onFileSelect: (file: File) => void;
  onFilesSelect: (files: File[]) => void;
  onStoredFilesSelect: (filesWithMetadata: Array<{ file: File; originalId: string; metadata: FileMetadata }>) => void;
  onModalClose?: () => void;
  setOnModalClose: (callback: () => void) => void;
}

const FilesModalContext = createContext<FilesModalContextType | null>(null);

export const FilesModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addToActiveFiles, addMultipleFiles, addStoredFiles } = useFileHandler();
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [onModalClose, setOnModalClose] = useState<(() => void) | undefined>();
  const [insertAfterPage, setInsertAfterPage] = useState<number | undefined>();
  const [customHandler, setCustomHandler] = useState<((files: File[], insertAfterPage?: number) => void) | undefined>();

  const openFilesModal = useCallback((options?: { insertAfterPage?: number; customHandler?: (files: File[], insertAfterPage?: number) => void }) => {
    setInsertAfterPage(options?.insertAfterPage);
    setCustomHandler(() => options?.customHandler);
    setIsFilesModalOpen(true);
  }, []);

  const closeFilesModal = useCallback(() => {
    setIsFilesModalOpen(false);
    setInsertAfterPage(undefined); // Clear insertion position
    setCustomHandler(undefined); // Clear custom handler
    onModalClose?.();
  }, [onModalClose]);

  const handleFileSelect = useCallback((file: File) => {
    if (customHandler) {
      // Use custom handler for special cases (like page insertion)
      customHandler([file], insertAfterPage);
    } else {
      // Use normal file handling
      addToActiveFiles(file);
    }
    closeFilesModal();
  }, [addToActiveFiles, closeFilesModal, insertAfterPage, customHandler]);

  const handleFilesSelect = useCallback((files: File[]) => {
    if (customHandler) {
      // Use custom handler for special cases (like page insertion)
      customHandler(files, insertAfterPage);
    } else {
      // Use normal file handling
      addMultipleFiles(files);
    }
    closeFilesModal();
  }, [addMultipleFiles, closeFilesModal, insertAfterPage, customHandler]);

  const handleStoredFilesSelect = useCallback((filesWithMetadata: Array<{ file: File; originalId: string; metadata: FileMetadata }>) => {
    if (customHandler) {
      // Use custom handler for special cases (like page insertion)
      const files = filesWithMetadata.map(item => item.file);
      customHandler(files, insertAfterPage);
    } else {
      // Use normal file handling
      addStoredFiles(filesWithMetadata);
    }
    closeFilesModal();
  }, [addStoredFiles, closeFilesModal, insertAfterPage, customHandler]);

  const setModalCloseCallback = useCallback((callback: () => void) => {
    setOnModalClose(() => callback);
  }, []);

  const contextValue: FilesModalContextType = useMemo(() => ({
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    onFileSelect: handleFileSelect,
    onFilesSelect: handleFilesSelect,
    onStoredFilesSelect: handleStoredFilesSelect,
    onModalClose,
    setOnModalClose: setModalCloseCallback,
  }), [
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    handleFileSelect,
    handleFilesSelect,
    handleStoredFilesSelect,
    onModalClose,
    setModalCloseCallback,
  ]);

  return (
    <FilesModalContext.Provider value={contextValue}>
      {children}
    </FilesModalContext.Provider>
  );
};

export const useFilesModalContext = () => {
  const context = useContext(FilesModalContext);
  if (!context) {
    throw new Error('useFilesModalContext must be used within FilesModalProvider');
  }
  return context;
};
