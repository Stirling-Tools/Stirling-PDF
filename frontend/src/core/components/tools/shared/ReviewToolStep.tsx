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
import { downloadFromUrl } from "@app/services/downloadService";
import { useFileActions } from "@app/contexts/FileContext";
import { FileId } from "@app/types/fileContext";

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
      console.log('[ReviewToolStep] Downloading file:', {
        url: operation.downloadUrl,
        filename: operation.downloadFilename,
        localPath: operation.downloadLocalPath,
        outputFileIds: operation.outputFileIds
      });
      await downloadFromUrl(
        operation.downloadUrl,
        operation.downloadFilename || "download",
        operation.downloadLocalPath || undefined
      );
      console.log('[ReviewToolStep] Download complete, marking files clean');

      // Mark output files as clean after successful save to disk
      if (operation.outputFileIds && operation.downloadLocalPath) {
        console.log('[ReviewToolStep] Marking files as clean:', operation.outputFileIds);
        for (const fileId of operation.outputFileIds) {
          fileActions.updateStirlingFileStub(fileId as FileId, { isDirty: false });
        }
      } else {
        console.log('[ReviewToolStep] Skipping clean mark:', {
          hasOutputFileIds: !!operation.outputFileIds,
          hasLocalPath: !!operation.downloadLocalPath
        });
      }
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
  const { t } = useTranslation();

  return createStep(
    t("review", "Review"),
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
