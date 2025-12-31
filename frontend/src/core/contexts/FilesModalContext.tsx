import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useFileHandler } from '@app/hooks/useFileHandler';
import { useFileActions } from '@app/contexts/FileContext';
import { useFileContext } from '@app/contexts/file/fileHooks';
import { StirlingFileStub } from '@app/types/fileContext';
import type { FileId } from '@app/types/file';
import { fileStorage } from '@app/services/fileStorage';
import { usePendingFiles } from '@app/contexts/PendingFilesContext';

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
  const fileCtx = useFileContext();
  const { addPendingFiles, removePendingFiles } = usePendingFiles();
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
      closeFilesModal();
    } else {
      // Add pending placeholders immediately for instant visual feedback
      const pendingIds = addPendingFiles(files);
      
      // Close modal immediately so user sees the loading placeholders
      closeFilesModal();
      
      // Process each file individually so they load one by one
      files.forEach((file, index) => {
        const pendingId = pendingIds[index];
        
        (async () => {
          try {
            // Add this single file
            await addFiles([file]);
            // Find and select the newly added file
            const fileId = fileCtx.findFileId(file) as FileId | undefined;
            if (fileId) {
              const currentSelected = fileCtx.selectors.getSelectedStirlingFileStubs().map((s) => s.id);
              const nextSelection = Array.from(new Set([...currentSelected, fileId]));
              actions.setSelectedFiles(nextSelection);
            }
          } catch (error) {
            console.error(`Failed to upload file ${file.name}:`, error);
          } finally {
            // Remove this file's pending placeholder when done
            removePendingFiles([pendingId]);
          }
        })();
      });
    }
  }, [addFiles, closeFilesModal, insertAfterPage, customHandler, actions, fileCtx, addPendingFiles, removePendingFiles]);

  const handleRecentFileSelect = useCallback((stirlingFileStubs: StirlingFileStub[]) => {
    if (customHandler) {
      // Close modal first, then load files for custom handler
      closeFilesModal();
      
      (async () => {
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
      })();
    } else {
      // Create fake File objects for pending placeholders (using stub metadata)
      const fakeFiles = stirlingFileStubs.map(stub => ({
        name: stub.name,
        size: stub.size,
        lastModified: stub.lastModified,
      } as File));
      
      // Add pending placeholders immediately for instant visual feedback
      const pendingIds = addPendingFiles(fakeFiles);
      
      // Close modal immediately so user sees the loading placeholders
      closeFilesModal();
      
      // Process each file individually so they load one by one
      stirlingFileStubs.forEach((stub, index) => {
        const pendingId = pendingIds[index];
        
        (async () => {
          try {
            if (actions.addStirlingFileStubs) {
              await actions.addStirlingFileStubs([stub], { selectFiles: true });
              // Add to selection
              const currentSelected = fileCtx.selectors.getSelectedStirlingFileStubs().map((s) => s.id);
              const nextSelection = Array.from(new Set([...currentSelected, stub.id]));
              actions.setSelectedFiles(nextSelection);
            }
          } catch (error) {
            console.error(`Failed to load file ${stub.name}:`, error);
          } finally {
            // Remove this file's pending placeholder when done
            removePendingFiles([pendingId]);
          }
        })();
      });
    }
  }, [actions.addStirlingFileStubs, closeFilesModal, customHandler, insertAfterPage, actions, fileCtx, addPendingFiles, removePendingFiles]);

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
