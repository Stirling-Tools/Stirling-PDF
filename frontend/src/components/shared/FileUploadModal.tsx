import React from 'react';
import { Modal } from '@mantine/core';
import FileUploadSelector from './FileUploadSelector';
import { useFilesModalContext } from '../../contexts/FilesModalContext';

const FileUploadModal: React.FC = () => {
  const { isFilesModalOpen, closeFilesModal, onFileSelect, onFilesSelect } = useFilesModalContext();

  return (
    <Modal
      opened={isFilesModalOpen}
      onClose={closeFilesModal}
      title="Upload Files"
      size="xl"
      centered
    >
      <FileUploadSelector
        title="Upload Files"
        subtitle="Choose files from storage or upload new files"
        onFileSelect={onFileSelect}
        onFilesSelect={onFilesSelect}
        accept={["application/pdf"]}
        supportedExtensions={["pdf"]}
      />
    </Modal>
  );
};

export default FileUploadModal;