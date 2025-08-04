import React, { createContext, useContext } from 'react';
import { useFilesModal, UseFilesModalReturn } from '../hooks/useFilesModal';
import { useFileHandler } from '../hooks/useFileHandler';

interface FilesModalContextType extends UseFilesModalReturn {}

const FilesModalContext = createContext<FilesModalContextType | null>(null);

export const FilesModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { addToActiveFiles, addMultipleFiles } = useFileHandler();
  
  const filesModal = useFilesModal({
    onFileSelect: addToActiveFiles,
    onFilesSelect: addMultipleFiles,
  });

  return (
    <FilesModalContext.Provider value={filesModal}>
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