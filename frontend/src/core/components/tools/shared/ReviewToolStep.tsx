import React, { useEffect, useRef } from "react";
import { Button, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DownloadIcon from "@mui/icons-material/Download";
import UndoIcon from "@mui/icons-material/Undo";
import ErrorNotification from "@app/components/tools/shared/ErrorNotification";
import ResultsPreview from "@app/components/tools/shared/ResultsPreview";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";

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
  const stepRef = useRef<HTMLDivElement>(null);

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
          component="a"
          href={operation.downloadUrl}
          download={operation.downloadFilename}
          leftSection={<DownloadIcon />}
          color="blue"
          fullWidth
          mb="md"
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
