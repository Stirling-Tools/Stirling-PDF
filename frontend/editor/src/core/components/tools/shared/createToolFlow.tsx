import React from "react";
import { Stack } from "@mantine/core";
import {
  createToolSteps,
  ToolStepProvider,
} from "@app/components/tools/shared/ToolStep";
import { ScopedOperationButton } from "@app/components/tools/shared/ScopedOperationButton";
import {
  ToolStepWizard,
  WizardSlide,
} from "@app/components/tools/shared/ToolStepWizard";
import { WizardFilesStep } from "@app/components/tools/shared/WizardFilesStep";
import { ReviewStepContent } from "@app/components/tools/shared/ReviewToolStep";
import { ToolOperationHook } from "@app/hooks/tools/shared/useToolOperation";
import {
  ToolWorkflowTitle,
  ToolWorkflowTitleProps,
} from "@app/components/tools/shared/ToolWorkflowTitle";
import { StirlingFile } from "@app/types/fileContext";
import type { TooltipTip } from "@app/types/tips";
import type { ExecuteDisabledReason } from "@app/hooks/tools/shared/toolOperationTypes";
import i18n from "@app/i18n";

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
  /**
   * In the slide wizard, whether the user may advance past this step. Defaults
   * to true (the step is always passable). Set false to block Continue and
   * forward jumps until the step's inputs are valid.
   */
  canContinue?: boolean;
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
  // Execute button, shared by the wizard (final-slide CTA) and the accordion.
  const renderExecuteButton = (): React.ReactNode => {
    const eb = config.executeButton;
    if (!eb || eb.isVisible === false) return null;
    const hasFiles = (config.files.selectedFiles?.length ?? 0) > 0;
    // Explicit disabledReason wins; otherwise derive from structured fields.
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
          eb.showCloudBadge ?? config.review.operation.willUseCloud ?? false
        }
        data-testid={eb.testId}
        data-tour="run-button"
      />
    );
  };

  // ---- Build the pre-execution slide list for the wizard ----
  const minFiles = config.files.minFiles ?? 1;
  const filesCount = config.files.selectedFiles?.length ?? 0;
  const filesSatisfied = filesCount >= minFiles;
  const filesVisible = config.files.isVisible !== false;
  // Mirror the accordion's "collapse the Files step once selected": the Files
  // slide only appears while files are still needed.
  const includeFilesSlide = filesVisible && !filesSatisfied;
  const middleSteps = config.steps.filter((s) => s.isVisible !== false);

  const middleSlides: WizardSlide[] = middleSteps.map((step, index) => ({
    key: `step-${index}-${step.title}`,
    title: step.title,
    content: step.content,
    tooltip: step.tooltip,
    isValid: step.canContinue ?? true,
    blockedHint: i18n.t(
      "wizardCompleteStep",
      "Complete this step to continue.",
    ),
  }));

  // Key by tool identity so switching tools resets the wizard, while
  // adding/removing slides within a tool is handled by the wizard itself.
  const wizardKey = `${config.executeButton?.text ?? ""}|${middleSteps
    .map((s) => s.title)
    .join(">")}`;

  // ---- Results view: a completed progress bar + the review content (no
  // collapsed step sections). The review is the final, terminal slide. ----
  if (config.review.isVisible) {
    // Clicking an earlier segment returns to editing that step: run the step's
    // own reset (clears preview etc.) and clear results so we leave results mode.
    const resultSlides: WizardSlide[] = [
      ...middleSlides.map((slide, index) => ({
        ...slide,
        onActivate: () => {
          middleSteps[index].onCollapsedClick?.();
          config.review.operation.resetResults();
        },
      })),
      {
        key: "__review__",
        title: config.review.title,
        content: (
          <ReviewStepContent
            operation={config.review.operation}
            onFileClick={config.review.onFileClick}
            onUndo={config.review.onUndo}
          />
        ),
        isValid: true,
      },
    ];
    return (
      <ToolStepWizard
        key={wizardKey}
        slides={resultSlides}
        title={config.title}
        terminal
      />
    );
  }

  // ---- Pre-execution flow ----
  const wizardSlides: WizardSlide[] = [];
  if (includeFilesSlide) {
    wizardSlides.push({
      key: "__files__",
      title: i18n.t("files.title", "Files"),
      content: (
        <WizardFilesStep
          selectedFiles={config.files.selectedFiles}
          minFiles={config.files.minFiles}
        />
      ),
      isValid: filesSatisfied,
      // The upload CTA advances the wizard once enough files are added.
      hideContinue: true,
    });
  }
  wizardSlides.push(...middleSlides);

  if (wizardSlides.length >= 1) {
    return (
      <ToolStepWizard
        key={wizardKey}
        slides={wizardSlides}
        title={config.title}
        executeSlot={renderExecuteButton()}
        belowExecuteButton={config.belowExecuteButton}
        preview={filesCount > 0 ? config.preview : undefined}
      />
    );
  }

  // ---- Accordion fallback (rare zero-slide tool: file selected, no steps) ----
  const steps = createToolSteps();
  return (
    <Stack gap="sm" p="sm">
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
        {!config.review.isVisible && filesCount > 0 && config.preview}

        {/* Execute Button */}
        {(() => {
          const button = renderExecuteButton();
          if (!button) return null;
          return (
            <>
              {button}
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
