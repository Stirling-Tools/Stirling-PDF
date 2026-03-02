import React, { useEffect, useRef } from "react";
import { Button, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import UndoIcon from "@mui/icons-material/Undo";
import ErrorNotification from "@app/components/tools/shared/ErrorNotification";
import ResultsPreview from "@app/components/tools/shared/ResultsPreview";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { saveOperationResults } from "@app/services/operationResultsSaveService";
import { useFileActions, useFileState } from "@app/contexts/FileContext";
import { FileId } from "@app/types/fileContext";
import i18n from "@app/i18n";

export interface ReviewToolStepProps<TParams = unknown> {
  isVisible: boolean;
  operation: ToolOperationHook<TParams>;
  title?: string;
  onFileClick?: (file: File) => void;
  onUndo?: () => void;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
}

function ReviewStepContent<TParams = unknown>({
  operation,
  onFileClick,
  onUndo,
}: {
  operation: ToolOperationHook<TParams>;
  onFileClick?: (file: File) => void;
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const DownloadIcon = icons.download;
  const stepRef = useRef<HTMLDivElement>(null);
  const { actions: fileActions } = useFileActions();
  const { selectors } = useFileState();

  const handleUndo = async () => {
    try {
      onUndo?.();
    } catch (error) {
      // Error is already handled by useToolOperation, just reset loading state
      console.error("Undo operation failed:", error);
    }
  };

  const previewFiles =
    operation.files?.map((file, index) => ({
      file,
      thumbnail: operation.thumbnails[index],
    })) || [];

  const handleDownload = async () => {
    if (!operation.downloadUrl) return;
    try {
      await saveOperationResults({
        downloadUrl: operation.downloadUrl,
        downloadFilename: operation.downloadFilename || "download",
        downloadLocalPath: operation.downloadLocalPath,
        outputFileIds: operation.outputFileIds,
        getFile: (fileId) => selectors.getFile(fileId as FileId),
        getStub: (fileId) => selectors.getStirlingFileStub(fileId as FileId),
        markSaved: (fileId, savedPath) => {
          const stub = selectors.getStirlingFileStub(fileId as FileId);
          fileActions.updateStirlingFileStub(fileId as FileId, {
            localFilePath: stub?.localFilePath ?? savedPath,
            isDirty: false
          });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ReviewToolStep] Failed to download file:", message);
      alert(`Failed to download file: ${message}`);
    }
  };

  // Auto-scroll to bottom when content appears
  useEffect(() => {
    if (stepRef.current && (previewFiles.length > 0 || operation.downloadUrl || operation.errorMessage)) {
      const scrollableContainer = stepRef.current.closest('[style*="overflow: auto"]') as HTMLElement;
      if (scrollableContainer) {
        setTimeout(() => {
          scrollableContainer.scrollTo({
            top: scrollableContainer.scrollHeight,
            behavior: "smooth",
          });
        }, 100); // Small delay to ensure content is rendered
      }
    }
  }, [previewFiles.length, operation.downloadUrl, operation.errorMessage]);

  return (
    <Stack gap="sm" ref={stepRef}>
      <ErrorNotification error={operation.errorMessage} onClose={operation.clearError} />

      {previewFiles.length > 0 && (
        <ResultsPreview
          files={previewFiles}
          onFileClick={onFileClick}
          isGeneratingThumbnails={operation.isGeneratingThumbnails}
        />
      )}

      {onUndo && (
        <Tooltip content={t("undoOperationTooltip", "Click to undo the last operation and restore the original files")}>
          <Button
            leftSection={<UndoIcon />}
            variant="outline"
            color="var(--mantine-color-gray-6)"
            onClick={handleUndo}
            fullWidth
          >
            {t("undo", "Undo")}
          </Button>
        </Tooltip>
      )}
      {operation.downloadUrl && (
        <Button
          leftSection={<DownloadIcon />}
          color="blue"
          fullWidth
          mb="md"
          onClick={handleDownload}
        >
          {terminology.download}
        </Button>
      )}

      <SuggestedToolsSection />
    </Stack>
  );
}

export function createReviewToolStep<TParams = unknown>(
  createStep: (
    title: string,
    props: {
      isVisible?: boolean;
      isCollapsed?: boolean;
      onCollapsedClick?: () => void;
      _excludeFromCount?: boolean;
      _noPadding?: boolean;
    },
    children?: React.ReactNode
  ) => React.ReactElement,
  props: ReviewToolStepProps<TParams>
): React.ReactElement {
  return createStep(
    i18n.t("review", "Review"),
    {
      isVisible: props.isVisible,
      isCollapsed: props.isCollapsed,
      onCollapsedClick: props.onCollapsedClick,
      _excludeFromCount: true,
      _noPadding: true,
    },
    <ReviewStepContent operation={props.operation} onFileClick={props.onFileClick} onUndo={props.onUndo} />
  );
}
