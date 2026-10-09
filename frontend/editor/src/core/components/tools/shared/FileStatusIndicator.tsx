import { useState, useEffect } from "react";
import { Text, Anchor, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { useFilesModalContext } from "@app/contexts/FilesModalContext";
import { useAllFiles } from "@app/contexts/FileContext";
import { useFileManager } from "@app/hooks/useFileManager";
import { StirlingFile, StirlingFileStub } from "@app/types/fileContext";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { ProtectedPdfToolNotice } from "@app/components/tools/shared/ProtectedPdfToolNotice";

export interface FileStatusIndicatorProps {
  selectedFiles?: StirlingFile[];
  minFiles?: number;
  unavailableFiles?: readonly StirlingFileStub[];
}

const FileStatusIndicator = ({
  selectedFiles = [],
  minFiles = 1,
  unavailableFiles = [],
}: FileStatusIndicatorProps) => {
  const { t } = useTranslation();
  const { openFilesModal, onFileUpload } = useFilesModalContext();
  const { files: workbenchFiles } = useAllFiles();
  const { loadRecentFiles } = useFileManager();
  const [hasRecentFiles, setHasRecentFiles] = useState<boolean | null>(null);

  useEffect(() => {
    const checkRecentFiles = async () => {
      try {
        const recentFiles = await loadRecentFiles();
        setHasRecentFiles(recentFiles.length > 0);
      } catch {
        setHasRecentFiles(false);
      }
    };
    void checkRecentFiles();
  }, [loadRecentFiles]);

  const handleNativeUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,application/pdf";
    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) onFileUpload(files);
    };
    input.click();
  };

  if (hasRecentFiles === null) return null;

  const needsFiles = selectedFiles.length < minFiles;
  const showPlaceholder =
    workbenchFiles.length > 0 && unavailableFiles.length === 0;
  const pickerLabel = hasRecentFiles
    ? t("files.addFiles", "Add files")
    : workbenchFiles.length === 0
      ? t("files.upload", "Upload")
      : t("files.uploadFiles", "Upload Files");

  return (
    <Stack gap="xs" data-testid="tool-file-list">
      {selectedFiles.length > 0 && (
        <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          ✓{" "}
          {selectedFiles.length === 1 ? (
            <PrivateContent>
              {t("fileSelected", "{{filename}}", {
                filename: selectedFiles[0]?.name,
              })}
            </PrivateContent>
          ) : (
            t("filesSelected", "{{count}} files", {
              count: selectedFiles.length,
            })
          )}
        </Text>
      )}
      <ProtectedPdfToolNotice files={unavailableFiles} />
      {needsFiles && (
        <Text size="sm" c="dimmed">
          {showPlaceholder &&
            (minFiles === 1
              ? t(
                  "files.selectFromWorkbench",
                  "Add files to the workbench or ",
                ) + " "
              : t(
                  "files.selectMultipleFromWorkbench",
                  "Add at least {{count}} files to the workbench or ",
                  { count: minFiles },
                ) + " ")}
          <Anchor
            size="sm"
            onClick={
              hasRecentFiles ? () => openFilesModal({}) : handleNativeUpload
            }
            style={{
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            <Icon name={hasRecentFiles ? "folder" : "upload"} size="0.875rem" />
            {pickerLabel}
          </Anchor>
        </Text>
      )}
    </Stack>
  );
};

export default FileStatusIndicator;
