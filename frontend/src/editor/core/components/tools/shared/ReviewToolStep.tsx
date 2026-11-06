import React, { useEffect, useRef } from "react";
import { Menu, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";
import { Icon } from "@editor/ui/Icon";
import ErrorNotification from "@editor/components/tools/shared/ErrorNotification";
import ResultsPreview from "@editor/components/tools/shared/ResultsPreview";
import { SuggestedToolsSection } from "@editor/components/tools/shared/SuggestedToolsSection";
import { ToolOperationHook } from "@editor/hooks/tools/shared/useToolOperation";
import { Tooltip } from "@editor/components/shared/Tooltip";
import { useFileActionTerminology } from "@editor/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@editor/hooks/useFileActionIcons";
import { saveOperationResults } from "@editor/services/operationResultsSaveService";
import { useFileActions, useFileSelectors } from "@editor/contexts/FileContext";
import i18n from "@editor/i18n";
import {
  getOpenedRightsManagedPdf,
  getRightsManagedThumbnail,
  rightsManagedSaveBlocked,
} from "@editor/services/rightsManagedPdf";
import { useRightsManagedPdfRevision } from "@editor/hooks/useRightsManagedPdf";
import { useSaveStoredFile } from "@editor/hooks/useSaveStoredFile";
import { useSaveButton } from "@editor/components/shared/workbenchBar/useSaveButton";
import type { FileId } from "@editor/types/file";
import type { StirlingFileStub } from "@editor/types/fileContext";

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
  notice?: React.ReactNode;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
}

function ReviewStepContent<TParams = unknown>({
  operation,
  onFileClick,
  onUndo,
  notice,
}: {
  operation: ToolOperationHook<TParams>;
  onFileClick?: (file: File) => void;
  onUndo?: () => void;
  notice?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const stepRef = useRef<HTMLDivElement>(null);
  const { actions: fileActions } = useFileActions();
  const selectors = useFileSelectors();
  const saver = useSaveStoredFile();
  const outputStubs = (operation.outputFileIds ?? [])
    .map((id) => selectors.getStirlingFileStub(id as FileId))
    .filter((stub): stub is StirlingFileStub => Boolean(stub));
  const targets = outputStubs.map(saver.targetFor);
  // Results inherit their source's home, so Save sends them back there too.
  const savesToTarget = targets.length > 0 && targets.every(Boolean);
  const oneTarget =
    savesToTarget && targets.every((target) => target === targets[0])
      ? targets[0]
      : undefined;
  const saveLabel = oneTarget
    ? outputStubs.length > 1
      ? oneTarget.saveAllLabel()
      : oneTarget.saveLabel(
          outputStubs[0],
          saver.planFor(outputStubs[0]) ?? "replace",
        )
    : terminology.download;
  const saveButton = useSaveButton({
    saver,
    targets: outputStubs,
    singleFile: outputStubs.length === 1,
    savesToDisk: Boolean(icons.saveAs),
    onSaveLocalCopy: () =>
      void (async () => {
        for (const stub of outputStubs)
          await saver.saveLocalCopy(stub, selectors.getFile(stub.id));
      })(),
    fileFor: async (stub) => selectors.getFile(stub.id),
  });

  const handleUndo = async () => {
    try {
      onUndo?.();
    } catch (error) {
      // Error is already handled by useToolOperation, just reset loading state
      console.error("Undo operation failed:", error);
    }
  };

  useRightsManagedPdfRevision();
  const previewFiles =
    operation.files?.map((file, index) => ({
      file,
      thumbnail: getRightsManagedThumbnail(file) ?? operation.thumbnails[index],
    })) || [];
  const rightsManagedOutput =
    operation.files?.some((file) => getOpenedRightsManagedPdf(file)) ?? false;
  const copyBlocked =
    operation.files?.some((file) => rightsManagedSaveBlocked(file)) ?? false;

  const handleDownload = async () => {
    if (!operation.downloadUrl) return;
    if (savesToTarget) {
      for (const stub of outputStubs) {
        const outcome = await saver.saveStoredFile(
          stub,
          selectors.getFile(stub.id),
        );
        if (outcome !== "saved") break;
      }
      return;
    }
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

      {notice}

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
            leftSection={<Icon name="undo-2" />}
            variant="secondary"
            accent="neutral"
            onClick={handleUndo}
            fullWidth
          >
            {t("undo", "Undo")}
          </Button>
        </Tooltip>
      )}
      {operation.downloadUrl && !saveButton.menu && (
        <Button
          data-testid="download-result-button"
          leftSection={<Icon name={oneTarget?.icon ?? icons.download} />}
          fullWidth
          style={{ marginBottom: "1rem" }}
          onClick={handleDownload}
        >
          {saveLabel}
        </Button>
      )}
      {operation.downloadUrl && saveButton.menu && (
        <Button.Group style={{ marginBottom: "1rem", width: "100%" }}>
          <Button
            data-testid="download-result-button"
            leftSection={<Icon name={oneTarget?.icon ?? icons.download} />}
            style={{ flex: 1, minWidth: 0 }}
            onClick={handleDownload}
          >
            {saveLabel}
          </Button>
          <Menu shadow="md" width={270} position="bottom-end">
            <Menu.Target>
              <Button
                data-testid="download-result-menu"
                px="sm"
                disabled={copyBlocked}
                aria-label={t("saveFile.menu.more", "More save options")}
              >
                <Icon name="chevron-down" />
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {saveButton.menu.map((item) => (
                <Menu.Item
                  key={item.key}
                  leftSection={<Icon name={item.icon} size="1rem" />}
                  onClick={item.onClick}
                >
                  {item.label}
                  {item.description && (
                    <Text size="xs" c="dimmed">
                      {item.description}
                    </Text>
                  )}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Button.Group>
      )}

      <SuggestedToolsSection rightsManaged={rightsManagedOutput} />
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
      notice={props.notice}
    />,
  );
}
