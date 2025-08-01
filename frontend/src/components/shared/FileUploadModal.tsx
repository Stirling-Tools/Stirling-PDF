import React from 'react';
import { Modal } from '@mantine/core';
import FileUploadSelector from './FileUploadSelector';
import { useFilesModalContext } from '../../contexts/FilesModalContext';
import { Tool } from '../../types/tool';

interface FileUploadModalProps {
  selectedTool?: Tool | null;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({ selectedTool }) => {
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
        accept={["*/*"]}
        supportedExtensions={selectedTool?.supportedFormats || ["pdf"]}
        data-testid="file-upload-modal"
      />
    </Modal>
  );
};

export default FileUploadModal;