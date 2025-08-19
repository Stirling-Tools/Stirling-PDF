import React from "react";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

export interface FileStatusIndicatorProps {
  selectedFiles?: File[];
  placeholder?: string;
  minFiles?: number;
}

const FileStatusIndicator = ({
  selectedFiles = [],
  placeholder,
  minFiles = 1,
}: FileStatusIndicatorProps) => {
const { t } = useTranslation();
  const defaultPlaceholder = placeholder || t("files.placeholder", "Select a PDF file in the main view to get started");

  // Only show content when no files are selected
  if (selectedFiles.length < minFiles) {
    return (
      <Text size="sm" c="dimmed">
        {defaultPlaceholder}
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
