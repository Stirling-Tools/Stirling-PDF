import React from 'react';
import { Stack } from '@mantine/core';
import { createToolSteps, ToolStepProvider } from './ToolStep';
import OperationButton from './OperationButton';
import { ToolOperationHook } from '../../../hooks/tools/shared/useToolOperation';

export interface FilesStepConfig {
  selectedFiles: File[];
  isCollapsed?: boolean;
  placeholder?: string;
  onCollapsedClick?: () => void;
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

export interface ResultsStepConfig {
  isVisible: boolean;
  operation: ToolOperationHook<any>;
  title: string;
  onFileClick?: (file: File) => void;
  testId?: string;
}

export interface ToolFlowConfig {
  files: FilesStepConfig;
  steps: MiddleStepConfig[];
  executeButton?: ExecuteButtonConfig;
  results: ResultsStepConfig;
}

/**
 * Creates a flexible tool flow with configurable steps and state management left to the tool.
 * Reduces boilerplate while allowing tools to manage their own collapse/expansion logic.
 */
export function createToolFlow(config: ToolFlowConfig) {
  const steps = createToolSteps();
  
  return (
    <ToolStepProvider>
      {/* Files Step */}
      {steps.createFilesStep({
        selectedFiles: config.files.selectedFiles,
        isCollapsed: config.files.isCollapsed,
        placeholder: config.files.placeholder,
        onCollapsedClick: config.files.onCollapsedClick
      })}

      {/* Middle Steps */}
      {config.steps.map((stepConfig, index) => 
        steps.create(stepConfig.title, {
          isVisible: stepConfig.isVisible,
          isCollapsed: stepConfig.isCollapsed,
          onCollapsedClick: stepConfig.onCollapsedClick,
          tooltip: stepConfig.tooltip
        }, stepConfig.content)
      )}

      {/* Execute Button */}
      {config.executeButton && config.executeButton.isVisible !== false && (
        <OperationButton
          onClick={config.executeButton.onClick}
          isLoading={config.results.operation.isLoading}
          disabled={config.executeButton.disabled}
          loadingText={config.executeButton.loadingText}
          submitText={config.executeButton.text}
          data-testid={config.executeButton.testId}
        />
      )}

      {/* Results Step */}
      {steps.createResultsStep({
        isVisible: config.results.isVisible,
        operation: config.results.operation,
        title: config.results.title,
        onFileClick: config.results.onFileClick
      })}
    </ToolStepProvider>
  );
}