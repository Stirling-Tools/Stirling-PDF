import React from "react";
import { Text, Anchor } from "@mantine/core";
import { useTranslation } from "react-i18next";
import FolderIcon from '@mui/icons-material/Folder';
import { useFilesModalContext } from "../../../contexts/FilesModalContext";
import { useAllFiles } from "../../../contexts/FileContext";

export interface FileStatusIndicatorProps {
  selectedFiles?: File[];
  placeholder?: string;
}

const FileStatusIndicator = ({
  selectedFiles = [],
  placeholder,
}: FileStatusIndicatorProps) => {
  const { t } = useTranslation();
  const { openFilesModal } = useFilesModalContext();
  const { files: workbenchFiles } = useAllFiles();

  // Check if there are no files in the workbench
  if (workbenchFiles.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t("files.noFiles", "No files uploaded. ")}{" "}
        <Anchor
          size="sm"
          onClick={() => openFilesModal()}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <FolderIcon style={{ fontSize: '14px' }} />
          {t("files.addFiles", "Add files")}
        </Anchor>
      </Text>
    );
  }

  // Show selection status when there are files in workbench
  if (selectedFiles.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {t("files.selectFromWorkbench", "Select files from the workbench or ") + " "}
        <Anchor
          size="sm"
          onClick={() => openFilesModal()}
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <FolderIcon style={{ fontSize: '14px' }} />
          {t("files.addFiles", "Add files")}
        </Anchor>
      </Text>
    );
  }

  return (
   <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
        ✓ {selectedFiles.length === 1 ? t("fileSelected", "Selected: {{filename}}", { filename: selectedFiles[0]?.name }) : t("filesSelected", "{{count}} files selected", { count: selectedFiles.length })}
    </Text>
  );
};

export default FileStatusIndicator;
