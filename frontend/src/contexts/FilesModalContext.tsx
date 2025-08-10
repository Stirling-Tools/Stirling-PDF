import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useFileHandler } from '../hooks/useFileHandler';

interface FilesModalContextType {
  isFilesModalOpen: boolean;
  openFilesModal: () => void;
  closeFilesModal: () => void;
  onFileSelect: (file: File) => void;
  onFilesSelect: (files: File[]) => void;
  onModalClose: () => void;
  setOnModalClose: (callback: () => void) => void;
}

const FilesModalContext = createContext<FilesModalContextType | null>(null);

export const FilesModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addToActiveFiles, addMultipleFiles } = useFileHandler();
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [onModalClose, setOnModalClose] = useState<(() => void) | undefined>();

  const openFilesModal = useCallback(() => {
    setIsFilesModalOpen(true);
  }, []);

  const closeFilesModal = useCallback(() => {
    setIsFilesModalOpen(false);
    onModalClose?.();
  }, [onModalClose]);

  const handleFileSelect = useCallback((file: File) => {
    addToActiveFiles(file);
    closeFilesModal();
  }, [addToActiveFiles, closeFilesModal]);

  const handleFilesSelect = useCallback((files: File[]) => {
    addMultipleFiles(files);
    closeFilesModal();
  }, [addMultipleFiles, closeFilesModal]);

  const setModalCloseCallback = useCallback((callback: () => void) => {
    setOnModalClose(() => callback);
  }, []);

  const contextValue: FilesModalContextType = useMemo(() => ({
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    onFileSelect: handleFileSelect,
    onFilesSelect: handleFilesSelect,
    onModalClose,
    setOnModalClose: setModalCloseCallback,
  }), [
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    handleFileSelect,
    handleFilesSelect,
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