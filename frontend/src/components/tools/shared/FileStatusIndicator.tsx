import React, { useState, useEffect } from "react";
import { Text, Anchor } from "@mantine/core";
import { useTranslation } from "react-i18next";
import FolderIcon from '@mui/icons-material/Folder';
import UploadIcon from '@mui/icons-material/Upload';
import { useFilesModalContext } from "../../../contexts/FilesModalContext";
import { useAllFiles } from "../../../contexts/FileContext";
import { useFileManager } from "../../../hooks/useFileManager";

export interface FileStatusIndicatorProps {
  selectedFiles?: File[];
  placeholder?: string;
}

const FileStatusIndicator = ({
  selectedFiles = [],
}: FileStatusIndicatorProps) => {
  const { t } = useTranslation();
  const { openFilesModal, onFilesSelect } = useFilesModalContext();
  const { files: workbenchFiles } = useAllFiles();
  const { loadRecentFiles } = useFileManager();
  const [hasRecentFiles, setHasRecentFiles] = useState<boolean | null>(null);

  // Check if there are recent files
  useEffect(() => {
    const checkRecentFiles = async () => {
      try {
        const recentFiles = await loadRecentFiles();
        setHasRecentFiles(recentFiles.length > 0);
      } catch (error) {
        setHasRecentFiles(false);
      }
    };
    checkRecentFiles();
  }, [loadRecentFiles]);

  // Handle native file picker
  const handleNativeUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,application/pdf';
    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        onFilesSelect(files);
      }
    };
    input.click();
  };

  // Don't render until we know if there are recent files
  if (hasRecentFiles === null) {
    return null;
  }

  // Check if there are no files in the workbench
  if (workbenchFiles.length === 0) {
    // If no recent files, show upload button
    if (!hasRecentFiles) {
      return (
        <Text size="sm" c="dimmed">
          <Anchor
            size="sm"
            onClick={handleNativeUpload}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <UploadIcon style={{ fontSize: '0.875rem' }} />
            {t("files.upload", "Upload")}
          </Anchor>
        </Text>
      );
    } else {
      // If there are recent files, show add files button
      return (
        <Text size="sm" c="dimmed">
          <Anchor
            size="sm"
            onClick={() => openFilesModal()}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <FolderIcon style={{ fontSize: '0.875rem' }} />
            {t("files.addFiles", "Add files")}
          </Anchor>
        </Text>
      );
    }
  }

  // Show selection status when there are files in workbench
  if (selectedFiles.length === 0) {
    // If no recent files, show upload option
    if (!hasRecentFiles) {
      return (
        <Text size="sm" c="dimmed">
          {t("files.selectFromWorkbench", "Select files from the workbench or ") + " "}
          <Anchor
            size="sm"
            onClick={handleNativeUpload}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <UploadIcon style={{ fontSize: '0.875rem' }} />
            {t("files.upload", "Upload")}
          </Anchor>
        </Text>
      );
    } else {
      // If there are recent files, show add files option
      return (
        <Text size="sm" c="dimmed">
          {t("files.selectFromWorkbench", "Select files from the workbench or ") + " "}
          <Anchor
            size="sm"
            onClick={() => openFilesModal()}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <FolderIcon style={{ fontSize: '0.875rem' }} />
            {t("files.addFiles", "Add files")}
          </Anchor>
        </Text>
      );
    }
  }

  return (
   <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
        ✓ {selectedFiles.length === 1 ? t("fileSelected", "Selected: {{filename}}", { filename: selectedFiles[0]?.name }) : t("filesSelected", "{{count}} files selected", { count: selectedFiles.length })}
    </Text>
  );
};

export default FileStatusIndicator;
