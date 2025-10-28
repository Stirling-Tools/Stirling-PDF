import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFileActions } from '@app/contexts/FileContext';
import { StirlingFileStub } from '@app/types/fileContext';

interface FilesModalContextType {
  isFilesModalOpen: boolean;
  openFilesModal: (options?: { insertAfterPage?: number; customHandler?: (files: File[] | StirlingFileStub[], insertAfterPage?: number, isFromStorage?: boolean) => void }) => void;
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
  const [customHandler, setCustomHandler] = useState<((files: File[] | StirlingFileStub[], insertAfterPage?: number, isFromStorage?: boolean) => void) | undefined>();

  const openFilesModal = useCallback((options?: { insertAfterPage?: number; customHandler?: (files: File[] | StirlingFileStub[], insertAfterPage?: number, isFromStorage?: boolean) => void }) => {
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
      // Pass stubs directly to custom handler with flag indicating they're from storage
      customHandler(stirlingFileStubs, insertAfterPage, true);
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
