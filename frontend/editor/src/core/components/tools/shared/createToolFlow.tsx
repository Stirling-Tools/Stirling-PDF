import React from "react";
import { Stack } from "@mantine/core";
import {
  createToolSteps,
  ToolStepProvider,
} from "@app/components/tools/shared/ToolStep";
import { ScopedOperationButton } from "@app/components/tools/shared/ScopedOperationButton";
import { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import {
  ToolWorkflowTitle,
  ToolWorkflowTitleProps,
} from "@app/components/tools/shared/ToolWorkflowTitle";
import { StirlingFile } from "@app/types/fileContext";
import type { TooltipTip } from "@app/types/tips";
import type { ExecuteDisabledReason } from "@app/hooks/tools/shared/toolOperationTypes";

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
  /**
   * Pass the raw endpoint-enabled flag from useEndpointEnabled / useBaseTool.
   * createToolFlow derives the correct disabled reason automatically.
   * Priority: endpointUnavailable > noFiles > invalidParams
   */
  endpointEnabled?: boolean | null;
  /**
   * Pass the result of params.validateParameters().
   * createToolFlow uses this to show the 'invalidParams' disabled reason.
   */
  paramsValid?: boolean;
  /**
   * Explicit disabled reason override — use when the automatic computation
   * from endpointEnabled + paramsValid is insufficient.
   */
  disabledReason?: ExecuteDisabledReason;
  /** Raw override for tools with fully custom disable logic (e.g. Compare, ShowJS). */
  disabled?: boolean;
  testId?: string;
  showCloudBadge?: boolean;
  /** Suppress the automatic "(this file)" / "(N files)" scope hints in the button text. */
  disableScopeHints?: boolean;
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
  /** Optional content rendered immediately below the execute button (e.g. contextual help). */
  belowExecuteButton?: React.ReactNode;
  review: ReviewStepConfig<TParams>;
  forceStepNumbers?: boolean;
}

/**
 * Creates a flexible tool flow with configurable steps and state management left to the tool.
 * Reduces boilerplate while allowing tools to manage their own collapse/expansion logic.
 */
export function createToolFlow<TParams = unknown>(
  config: ToolFlowConfig<TParams>,
) {
  const steps = createToolSteps();

  return (
    <Stack gap="sm" p="sm">
      {/* <Stack gap="sm" p="sm" h="100%" w="100%" style={{ overflow: 'auto' }}> */}
      <ToolStepProvider forceStepNumbers={config.forceStepNumbers}>
        {config.title && <ToolWorkflowTitle {...config.title} />}

        {/* Files Step */}
        {config.files.isVisible !== false &&
          steps.createFilesStep({
            selectedFiles: config.files.selectedFiles,
            isCollapsed: config.files.isCollapsed,
            minFiles: config.files.minFiles,
            onCollapsedClick: config.files.onCollapsedClick,
          })}

        {/* Middle Steps */}
        {config.steps.map((stepConfig) =>
          steps.create(
            stepConfig.title,
            {
              isVisible: stepConfig.isVisible,
              isCollapsed: stepConfig.isCollapsed,
              onCollapsedClick: stepConfig.onCollapsedClick,
              tooltip: stepConfig.tooltip,
            },
            stepConfig.content,
          ),
        )}

        {/* Preview (outside steps, above execute button).
            Hide when review is visible or when no files are selected. */}
        {!config.review.isVisible &&
          (config.files.selectedFiles?.length ?? 0) > 0 &&
          config.preview}

        {/* Execute Button */}
        {config.executeButton &&
          config.executeButton.isVisible !== false &&
          (() => {
            const eb = config.executeButton;
            const hasFiles = (config.files.selectedFiles?.length ?? 0) > 0;
            // Compute the disabled reason from structured fields; explicit disabledReason wins if set.
            const effectiveDisabledReason: ExecuteDisabledReason =
              eb.disabledReason !== undefined
                ? eb.disabledReason
                : eb.endpointEnabled === false
                  ? "endpointUnavailable"
                  : !hasFiles
                    ? "noFiles"
                    : eb.paramsValid === false
                      ? "invalidParams"
                      : null;
            return (
              <>
                <ScopedOperationButton
                  selectedFiles={config.files.selectedFiles ?? []}
                  disableScopeHints={eb.disableScopeHints}
                  onClick={eb.onClick}
                  isLoading={config.review.operation.isLoading}
                  disabled={eb.disabled}
                  disabledReason={effectiveDisabledReason}
                  loadingText={eb.loadingText}
                  submitText={eb.text}
                  showCloudBadge={
                    eb.showCloudBadge ??
                    config.review.operation.willUseCloud ??
                    false
                  }
                  data-testid={eb.testId}
                  data-tour="run-button"
                />
                {config.belowExecuteButton}
              </>
            );
          })()}

        {/* Review Step */}
        {steps.createReviewStep({
          isVisible: config.review.isVisible,
          operation: config.review.operation,
          title: config.review.title,
          onFileClick: config.review.onFileClick,
          onUndo: config.review.onUndo,
        })}
      </ToolStepProvider>
    </Stack>
  );
}
