import { useState, useCallback } from 'react';

export interface UseFilesModalReturn {
  isFilesModalOpen: boolean;
  openFilesModal: () => void;
  closeFilesModal: () => void;
  onFileSelect?: (file: File) => void;
  onFilesSelect?: (files: File[]) => void;
  onModalClose?: () => void;
  setOnModalClose: (callback: () => void) => void;
}

interface UseFilesModalProps {
  onFileSelect?: (file: File) => void;
  onFilesSelect?: (files: File[]) => void;
}

export const useFilesModal = ({ 
  onFileSelect, 
  onFilesSelect 
}: UseFilesModalProps = {}): UseFilesModalReturn => {
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
    onFileSelect?.(file);
    closeFilesModal();
  }, [onFileSelect, closeFilesModal]);

  const handleFilesSelect = useCallback((files: File[]) => {
    onFilesSelect?.(files);
    closeFilesModal();
  }, [onFilesSelect, closeFilesModal]);

  const setModalCloseCallback = useCallback((callback: () => void) => {
    setOnModalClose(() => callback);
  }, []);

  return {
    isFilesModalOpen,
    openFilesModal,
    closeFilesModal,
    onFileSelect: handleFileSelect,
    onFilesSelect: handleFilesSelect,
    onModalClose,
    setOnModalClose: setModalCloseCallback,
  };
};