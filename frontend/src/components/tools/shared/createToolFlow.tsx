import React from 'react';
import { Stack } from '@mantine/core';
import { createToolSteps, ToolStepProvider } from './ToolStep';
import OperationButton from './OperationButton';
import { ToolOperationHook } from '../../../hooks/tools/shared/useToolOperation';
import { ToolWorkflowTitle, ToolWorkflowTitleProps } from './ToolWorkflowTitle';
import { StirlingFile } from '../../../types/fileContext';
import { SingleExpansionProvider } from './SingleExpansionContext';
import { useSingleExpandController } from './useSingleExpandController';

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
    tips?: any[];
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
}

export interface ReviewStepConfig {
  isVisible: boolean;
  operation: ToolOperationHook<any>;
  title: string;
  onFileClick?: (file: File) => void;
  onUndo: () => void;
  testId?: string;
}

export interface TitleConfig extends ToolWorkflowTitleProps {}

export interface ToolFlowConfig {
  title?: TitleConfig;
  files: FilesStepConfig;
  steps: MiddleStepConfig[];
  executeButton?: ExecuteButtonConfig;
  review: ReviewStepConfig;
  forceStepNumbers?: boolean;
  maxOneExpanded?: boolean;
  initialExpandedStep?: string | null;
}

// Hoist ToolFlowContent outside to make it stable across renders
function ToolFlowContent({ config }: { config: ToolFlowConfig }) {
  const steps = createToolSteps();
  const { onToggle, isCollapsed } = useSingleExpandController({
    filesVisible: config.files.isVisible !== false,
    stepVisibilities: config.steps.map(s => s.isVisible),
    resultsVisible: config.review.isVisible,
  });

  return (
    <Stack gap="sm" p="sm">
      <ToolStepProvider forceStepNumbers={config.forceStepNumbers}>
        {config.title && <ToolWorkflowTitle {...config.title} />}

        {/* Files Step */}
        {config.files.isVisible !== false && steps.createFilesStep({
          selectedFiles: config.files.selectedFiles,
          isCollapsed: isCollapsed('files', config.files.isCollapsed),
          minFiles: config.files.minFiles,
          onCollapsedClick: () => onToggle('files', config.files.onCollapsedClick)
        })}

        {/* Middle Steps */}
        {config.steps.map((stepConfig, index) => {
          const stepId = `step-${index}`;
          return (
            <React.Fragment key={stepId}>
              {steps.create(stepConfig.title, {
                isVisible: stepConfig.isVisible,
                isCollapsed: isCollapsed(stepId, stepConfig.isCollapsed),
                onCollapsedClick: () => onToggle(stepId, stepConfig.onCollapsedClick),
                tooltip: stepConfig.tooltip
              }, stepConfig.content)}
            </React.Fragment>
          );
        })}

        {/* Execute Button */}
        {config.executeButton && config.executeButton.isVisible !== false && (
          <OperationButton
            onClick={config.executeButton.onClick}
            isLoading={config.review.operation.isLoading}
            disabled={config.executeButton.disabled}
            loadingText={config.executeButton.loadingText}
            submitText={config.executeButton.text}
            data-testid={config.executeButton.testId}
          />
        )}

        {/* Review Step */}
        {steps.createReviewStep({
          isVisible: config.review.isVisible,
          operation: config.review.operation,
          title: config.review.title,
          onFileClick: config.review.onFileClick,
          onUndo: config.review.onUndo,
          isCollapsed: isCollapsed('review', false),
          onCollapsedClick: () => onToggle('review', undefined)
        })}
      </ToolStepProvider>
    </Stack>
  );
}

export interface ToolFlowProps extends ToolFlowConfig {}

export function ToolFlow(props: ToolFlowProps) {
  return (
    <SingleExpansionProvider 
      enabled={props.maxOneExpanded ?? false}
      initialExpandedStep={props.initialExpandedStep ?? null}
    >
      <ToolFlowContent config={props} />
    </SingleExpansionProvider>
  );
}

export function createToolFlow(config: ToolFlowConfig) {
  return <ToolFlow {...config} />;
}
