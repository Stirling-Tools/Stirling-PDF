import React from 'react';
import { Stack } from '@mantine/core';
import { createToolSteps, ToolStepProvider } from '@app/components/tools/shared/ToolStep';
import OperationButton from '@app/components/tools/shared/OperationButton';
import { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';
import { ToolWorkflowTitle, ToolWorkflowTitleProps } from '@app/components/tools/shared/ToolWorkflowTitle';
import { StirlingFile } from '@app/types/fileContext';
import type { TooltipTip } from '@app/types/tips';

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

/**
 * Creates a flexible tool flow with configurable steps and state management left to the tool.
 * Reduces boilerplate while allowing tools to manage their own collapse/expansion logic.
 */
export function createToolFlow<TParams = unknown>(config: ToolFlowConfig<TParams>) {
  const steps = createToolSteps();

  return (
    <Stack gap="sm" p="sm" >
    {/* <Stack gap="sm" p="sm" h="100%" w="100%" style={{ overflow: 'auto' }}> */}
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

        {/* Execute Button */}
        {config.executeButton && config.executeButton.isVisible !== false && (
          <OperationButton
            onClick={config.executeButton.onClick}
            isLoading={config.review.operation.isLoading}
            disabled={config.executeButton.disabled}
            loadingText={config.executeButton.loadingText}
            submitText={config.executeButton.text}
            showCloudBadge={config.executeButton.showCloudBadge ?? config.review.operation.willUseCloud}
            data-testid={config.executeButton.testId}
            data-tour="run-button"
          />
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