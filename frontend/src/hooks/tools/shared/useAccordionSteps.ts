import { useState, useCallback, useMemo, useEffect } from 'react';

/**
 * State conditions that affect accordion behavior
 */
export interface AccordionStateConditions {
  /** Whether files are present (steps collapse when false) */
  hasFiles?: boolean;
  /** Whether results are available (steps collapse when true) */
  hasResults?: boolean;
  /** Whether the accordion is disabled (steps collapse when true) */
  disabled?: boolean;
}

/**
 * Configuration for the useAccordionSteps hook
 */
export interface UseAccordionStepsConfig<T extends string | number | symbol> {
  /** Special step that represents "no step open" state */
  noneValue: T;
  /** Initial step to open */
  initialStep: T;
  /** Current state conditions that affect accordion behavior */
  stateConditions?: AccordionStateConditions;
  /** Callback to run when interacting with a step when we have results (usually used for resetting params) */
  afterResults?: () => void;
}

/**
 * Return type for the useAccordionSteps hook
 */
export interface AccordionStepsAPI<T extends string | number | symbol> {
  /** Currently active/open step (noneValue if no step is open) */
  currentStep: T;
  /** Get whether a specific step should be collapsed */
  getCollapsedState: (step: T) => boolean;
  /** Toggle a step open/closed (accordion behavior - only one open at a time) */
  handleStepToggle: (step: T) => void;
  /** Set the currently open step */
  setOpenStep: (step: T) => void;
  /** Close all steps */
  closeAllSteps: () => void;
}

/**
 * Accordion-style step management hook.
 *
 * Provides sophisticated accordion behavior where only one step can be open at a time,
 * with configurable collapse conditions.
 */
export function useAccordionSteps<T extends string | number | symbol>(
  config: UseAccordionStepsConfig<T>
): AccordionStepsAPI<T> {
  const { initialStep, stateConditions, noneValue } = config;

  const [openStep, setOpenStep] = useState<T>(initialStep);

  // Determine if all steps should be collapsed based on conditions
  const shouldCollapseAll = useMemo(() => {
    if (!stateConditions) {
      return false;
    }

    return (
      (stateConditions.hasFiles === false) ||
      (stateConditions.hasResults === true) ||
      (stateConditions.disabled === true)
    );
  }, [stateConditions]);

  // Get collapsed state for a specific step
  const getCollapsedState = useCallback((step: T): boolean => {
    if (shouldCollapseAll) {
      return true;
    } else {
      return openStep !== step;
    }
  }, [openStep, shouldCollapseAll]);

  // Handle step toggle with accordion behavior
  const handleStepToggle = useCallback((step: T) => {
    if (stateConditions?.hasResults) {
      config.afterResults?.();
    }

    // If all steps should be collapsed, don't allow opening
    if (shouldCollapseAll) {
      return;
    }

    // Accordion behavior: if clicking the open step, close it; otherwise open the clicked step
    setOpenStep(currentStep => {
      if (currentStep === step) {
        // Clicking the open step - close it
        return noneValue;
      } else {
        // Open the clicked step
        return step;
      }
    });
  }, [shouldCollapseAll, noneValue, stateConditions?.hasResults, config.afterResults]);

  // Close all steps
  const closeAllSteps = useCallback(() => {
    setOpenStep(noneValue);
  }, [noneValue]);

  // Automatically reset to first step if we have results
  // Note that everything is still collapsed when this happens, it's just preparing for re-running the tool
  useEffect(() => {
    if (stateConditions?.hasResults) {
      setOpenStep(initialStep);
    }
  }, [stateConditions?.hasResults, initialStep]);

  return {
    currentStep: shouldCollapseAll ? noneValue : openStep,
    getCollapsedState,
    handleStepToggle,
    setOpenStep,
    closeAllSteps
  };
}
