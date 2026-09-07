import React, { useEffect, useRef } from "react";
import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import UndoIcon from "@mui/icons-material/Undo";
import ErrorNotification from "@app/components/tools/shared/ErrorNotification";
import ResultsPreview from "@app/components/tools/shared/ResultsPreview";
import { SuggestedToolsSection } from "@app/components/tools/shared/SuggestedToolsSection";
import { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import { Tooltip } from "@app/components/shared/Tooltip";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { saveOperationResults } from "@app/services/operationResultsSaveService";
import { useFileActions, useFileSelectors } from "@app/contexts/FileContext";
import i18n from "@app/i18n";

/**
 * Nearest scrolling ancestor - in the right rail that is the tool panel's
 * ScrollArea viewport, whose overflow is `scroll`, not `auto`.
 */
function findScrollParent(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (
      /(auto|scroll|overlay)/.test(overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

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
  const selectors = useFileSelectors();

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
        getFile: (fileId) => selectors.getFile(fileId),
        getStub: (fileId) => selectors.getStirlingFileStub(fileId),
        markSaved: (fileId, savedPath) => {
          const stub = selectors.getStirlingFileStub(fileId);
          fileActions.updateStirlingFileStub(fileId, {
            localFilePath: stub?.localFilePath ?? savedPath,
            isDirty: false,
          });
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[ReviewToolStep] Failed to download file:", message);
      alert(`Failed to download file: ${message}`);
    }
  };

  // Reveal the results when they appear, or the download button lands below the
  // fold behind a tall settings step and reads as missing.
  useEffect(() => {
    const hasContent =
      previewFiles.length > 0 ||
      operation.downloadUrl ||
      operation.errorMessage;
    if (!stepRef.current || !hasContent) return;

    // Small delay so the step has been laid out before it is measured.
    const timer = setTimeout(() => {
      const step = stepRef.current;
      const scroller = step && findScrollParent(step);
      if (!step || !scroller) return;

      const stepRect = step.getBoundingClientRect();
      const viewRect = scroller.getBoundingClientRect();
      // Move the least that brings the step into view, and only ever the panel
      // itself - scrollIntoView() drags every ancestor and unpins the header.
      const delta = Math.min(
        stepRect.top - viewRect.top,
        stepRect.bottom - viewRect.bottom,
      );
      if (delta > 1) {
        scroller.scrollTo({
          top: scroller.scrollTop + delta,
          behavior: "smooth",
        });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [previewFiles.length, operation.downloadUrl, operation.errorMessage]);

  return (
    <Stack gap="sm" ref={stepRef}>
      <ErrorNotification
        error={operation.errorMessage}
        onClose={operation.clearError}
      />

      {previewFiles.length > 0 && (
        <ResultsPreview
          files={previewFiles}
          onFileClick={onFileClick}
          isGeneratingThumbnails={operation.isGeneratingThumbnails}
        />
      )}

      {onUndo && (
        <Tooltip
          position="left"
          content={t(
            "undoOperationTooltip",
            "Click to undo the last operation and restore the original files",
          )}
        >
          <Button
            leftSection={<UndoIcon />}
            variant="secondary"
            accent="neutral"
            onClick={handleUndo}
            fullWidth
          >
            {t("undo", "Undo")}
          </Button>
        </Tooltip>
      )}
      {operation.downloadUrl && (
        <Button
          data-testid="download-result-button"
          leftSection={<DownloadIcon />}
          fullWidth
          style={{ marginBottom: "1rem" }}
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
    children?: React.ReactNode,
  ) => React.ReactElement,
  props: ReviewToolStepProps<TParams>,
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
    <ReviewStepContent
      operation={props.operation}
      onFileClick={props.onFileClick}
      onUndo={props.onUndo}
    />,
  );
}
