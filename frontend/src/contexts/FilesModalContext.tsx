import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useFileHandler } from '../hooks/useFileHandler';
import { useFileActions } from './FileContext';
import { StirlingFileStub } from '../types/fileContext';
import { fileStorage } from '../services/fileStorage';

interface FilesModalContextType {
  isFilesModalOpen: boolean;
  openFilesModal: (options?: { insertAfterPage?: number; customHandler?: (files: File[], insertAfterPage?: number) => void }) => void;
  closeFilesModal: () => void;
  onFileUpload: (files: File[]) => void;
  onRecentFileSelect: (stirlingFileStubs: StirlingFileStub[]) => void;
  onModalClose?: () => void;
  setOnModalClose: (callback: () => void) => void;
}

const FilesModalContext = createContext<FilesModalContextType | null>(null);

export const FilesModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addFiles } = useFileHandler();
  const { actions } = useFileActions();
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

  const handleFileUpload = useCallback((files: File[]) => {
    if (customHandler) {
      // Use custom handler for special cases (like page insertion)
      customHandler(files, insertAfterPage);
    } else {
      // Use normal file handling
      addFiles(files);
    }
    closeFilesModal();
  }, [addFiles, closeFilesModal, insertAfterPage, customHandler]);

  const handleRecentFileSelect = useCallback(async (stirlingFileStubs: StirlingFileStub[]) => {
    if (customHandler) {
      // Load the actual files from storage for custom handler
      try {
        const loadedFiles: File[] = [];
        for (const stub of stirlingFileStubs) {
          const stirlingFile = await fileStorage.getStirlingFile(stub.id);
          if (stirlingFile) {
            loadedFiles.push(stirlingFile);
          }
        }
        
        if (loadedFiles.length > 0) {
          customHandler(loadedFiles, insertAfterPage);
        }
      } catch (error) {
        console.error('Failed to load files for custom handler:', error);
      }
    } else {
      // Normal case - use addStirlingFileStubs to preserve metadata
      if (actions.addStirlingFileStubs) {
        actions.addStirlingFileStubs(stirlingFileStubs, { selectFiles: true });
      } else {
        console.error('addStirlingFileStubs action not available');
      }
    }
    closeFilesModal();
  }, [actions.addStirlingFileStubs, closeFilesModal, customHandler, insertAfterPage]);

  const setModalCloseCallback = useCallback((callback: () => void) => {
    setOnModalClose(() => callback);
  }, []);

  const contextValue: FilesModalContextType = useMemo(() => ({
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    onFileUpload: handleFileUpload,
    onRecentFileSelect: handleRecentFileSelect,
    onModalClose,
    setOnModalClose: setModalCloseCallback,
  }), [
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    handleFileUpload,
    handleRecentFileSelect,
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
