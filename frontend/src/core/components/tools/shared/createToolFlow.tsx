import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, Text } from '@mantine/core';
import { createToolSteps, ToolStepProvider } from '@app/components/tools/shared/ToolStep';
import OperationButton from '@app/components/tools/shared/OperationButton';
import { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';
import { ToolWorkflowTitle, ToolWorkflowTitleProps } from '@app/components/tools/shared/ToolWorkflowTitle';
import { StirlingFile } from '@app/types/fileContext';
import type { TooltipTip } from '@app/types/tips';
import { useToolWorkflow } from '@app/contexts/ToolWorkflowContext';
import { useNavigationState, useNavigationActions } from '@app/contexts/NavigationContext';
import { useAllFiles } from '@app/contexts/file/fileHooks';

export interface FilesStepConfig {
  selectedFiles: StirlingFile[];
  isCollapsed?: boolean;
  minFiles?: number;
  onCollapsedClick?: () => void;
  isVisible?: boolean;
}

export interface MiddleStepConfig {
  title: string;
  isVisible?: boolean;
  isCollapsed?: boolean;
  onCollapsedClick?: () => void;
  content: React.ReactNode;
  tooltip?: {
    content?: React.ReactNode;
    tips?: TooltipTip[];
    header?: {
      title: string;
      logo?: React.ReactNode;
    };
  };
}

export interface ExecuteButtonConfig {
  text: string;
  loadingText: string;
  onClick: () => Promise<void>;
  isVisible?: boolean;
  disabled?: boolean;
  testId?: string;
  showCloudBadge?: boolean;
}

export interface ReviewStepConfig<TParams = unknown> {
  isVisible: boolean;
  operation: ToolOperationHook<TParams>;
  title: string;
  onFileClick?: (file: File) => void;
  onUndo?: () => void;
  testId?: string;
}

export interface TitleConfig extends ToolWorkflowTitleProps {}

export interface ToolFlowConfig<TParams = unknown> {
  title?: TitleConfig;
  files: FilesStepConfig;
  steps: MiddleStepConfig[];
  // Optional preview content rendered between steps and the execute button
  preview?: React.ReactNode;
  executeButton?: ExecuteButtonConfig;
  review: ReviewStepConfig<TParams>;
  forceStepNumbers?: boolean;
}

/** -1 means no limit; otherwise tool only accepts up to maxFiles. */
const UNLIMITED_FILES = -1;

function CreateToolFlowInner<TParams = unknown>(props: { config: ToolFlowConfig<TParams> }) {
  const { config } = props;
  const { t } = useTranslation();
  const { selectedTool } = useToolWorkflow();
  const { workbench } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const steps = createToolSteps();

  const { fileIds } = useAllFiles();
  const workbenchFileCount = fileIds.length;
  const maxFiles = selectedTool?.maxFiles;
  const tooManyFiles =
    maxFiles != null &&
    maxFiles !== UNLIMITED_FILES &&
    workbenchFileCount > maxFiles;

  // On initial mount, if too many files for this tool, redirect to active files once.
  // After that the user is free to navigate between views.
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!tooManyFiles || hasRedirected.current) return;
    if (workbench === 'viewer' || workbench === 'pageEditor') {
      hasRedirected.current = true;
      navActions.setWorkbench('fileEditor');
    }
  }, [tooManyFiles, workbench, navActions]);

  return (
    <Stack gap="sm" p="sm">
      <ToolStepProvider forceStepNumbers={config.forceStepNumbers}>
        {config.title && <ToolWorkflowTitle {...config.title} />}

        {/* Files Step */}
        {config.files.isVisible !== false && steps.createFilesStep({
          selectedFiles: config.files.selectedFiles,
          isCollapsed: config.files.isCollapsed,
          minFiles: config.files.minFiles,
          onCollapsedClick: config.files.onCollapsedClick
        })}

        {/* Middle Steps */}
        {config.steps.map((stepConfig) =>
          steps.create(stepConfig.title, {
            isVisible: stepConfig.isVisible,
            isCollapsed: stepConfig.isCollapsed,
            onCollapsedClick: stepConfig.onCollapsedClick,
            tooltip: stepConfig.tooltip
          }, stepConfig.content)
        )}

        {/* Preview (outside steps, above execute button).
            Hide when review is visible or when no files are selected. */}
        {!config.review.isVisible && (config.files.selectedFiles?.length ?? 0) > 0 && config.preview}

        {/* Execute Button + maxFiles message */}
        {config.executeButton && config.executeButton.isVisible !== false && (
          <>
            {tooManyFiles && (
              <Text size="sm" c="orange">
                {t('toolFlow.tooManyFiles', 'This tool only takes a max of {{max}} files', { max: maxFiles })}
              </Text>
            )}
            <OperationButton
              onClick={config.executeButton.onClick}
              isLoading={config.review.operation.isLoading}
              disabled={config.executeButton.disabled || tooManyFiles}
              loadingText={config.executeButton.loadingText}
              submitText={config.executeButton.text}
              showCloudBadge={config.executeButton.showCloudBadge ?? config.review.operation.willUseCloud ?? false}
              data-testid={config.executeButton.testId}
              data-tour="run-button"
            />
          </>
        )}

        {/* Review Step */}
        {steps.createReviewStep({
          isVisible: config.review.isVisible,
          operation: config.review.operation,
          title: config.review.title,
          onFileClick: config.review.onFileClick,
          onUndo: config.review.onUndo
        })}
      </ToolStepProvider>
    </Stack>
  );
}

/**
 * Creates a flexible tool flow with configurable steps and state management left to the tool.
 * Reduces boilerplate while allowing tools to manage their own collapse/expansion logic.
 * When the current tool has maxFiles !== -1, the execute button is disabled and a message
 * is shown if the user has more files selected than allowed.
 */
export function createToolFlow<TParams = unknown>(config: ToolFlowConfig<TParams>) {
  return <CreateToolFlowInner config={config as ToolFlowConfig<unknown>} />;
}