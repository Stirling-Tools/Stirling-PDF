import { useState, useEffect } from "react";
import { Text, Anchor } from "@mantine/core";
import { useTranslation } from "react-i18next";
import FolderIcon from '@mui/icons-material/Folder';
import UploadIcon from '@mui/icons-material/Upload';
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileManager } from "@app/hooks/useFileManager";
import { StirlingFile } from "@app/types/fileContext";
import { PrivateContent } from "@app/components/shared/PrivateContent"

export interface FileStatusIndicatorProps {
  selectedFiles?: StirlingFile[];
  minFiles?: number;
}

const FileStatusIndicator = ({
  selectedFiles = [],
  minFiles = 1,
}: FileStatusIndicatorProps) => {
  const { t } = useTranslation();
  const { openFilesModal, onFileUpload } = useFilesModalContext();
  const { files: stirlingFileStubs } = useAllFiles();
  const { loadRecentFiles } = useFileManager();
  const [hasRecentFiles, setHasRecentFiles] = useState<boolean | null>(null);

  // Check if there are recent files
  useEffect(() => {
    const checkRecentFiles = async () => {
      try {
        const recentFiles = await loadRecentFiles();
        setHasRecentFiles(recentFiles.length > 0);
      } catch {
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
        onFileUpload(files);
      }
    };
    input.click();
  };

  // Don't render until we know if there are recent files
  if (hasRecentFiles === null) {
    return null;
  }

  const getPlaceholder = () => {
    if (minFiles === undefined || minFiles === 1) {
      return t("files.selectFromWorkbench", "Select files from the workbench or ");
    } else {
      return t("files.selectMultipleFromWorkbench", "Select at least {{count}} files from the workbench or ", { count: minFiles });
    }
  };

  // Check if there are no files in the workbench
  if (stirlingFileStubs.length === 0) {
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
            onClick={() => openFilesModal({})}
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
  if (selectedFiles.length < minFiles) {
    // If no recent files, show upload option
    if (!hasRecentFiles) {
      return (
        <Text size="sm" c="dimmed">
          {getPlaceholder() + " "}
          <Anchor
            size="sm"
            onClick={handleNativeUpload}
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <UploadIcon style={{ fontSize: '0.875rem' }} />
            {t("files.uploadFiles", "Upload Files")}
          </Anchor>
        </Text>
      );
    } else {
      // If there are recent files, show add files option
      return (
        <Text size="sm" c="dimmed">
          {getPlaceholder() + " "}
          <Anchor
            size="sm"
            onClick={() => openFilesModal({})}
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
      ✓ {selectedFiles.length === 1
          ? <PrivateContent>{t("fileSelected", "Selected: {{filename}}", { filename: selectedFiles[0]?.name }) }</PrivateContent>
          : t("filesSelected", "{{count}} files selected", { count: selectedFiles.length })}
    </Text>
  );
};

export default FileStatusIndicator;
