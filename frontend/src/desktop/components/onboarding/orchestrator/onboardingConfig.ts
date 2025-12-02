/**
 * Desktop Override: Onboarding Configuration
 * 
 * This version modifies the onboarding config for the desktop app:
 * - Sets isDesktopApp to true in the default runtime state
 * - This causes desktop-install step to be skipped
 * 
 * All other step definitions and logic remain the same.
 */

// Re-export everything from core
export {
  ONBOARDING_STEPS,
  getStepById,
  getStepIndex,
} from '@core/components/onboarding/orchestrator/onboardingConfig';

export type {
  OnboardingStepId,
  OnboardingStepType,
  OnboardingStep,
  OnboardingRuntimeState,
  OnboardingConditionContext,
} from '@core/components/onboarding/orchestrator/onboardingConfig';

// Import and override the default runtime state
import { DEFAULT_RUNTIME_STATE as CORE_DEFAULT_RUNTIME_STATE } from '@core/components/onboarding/orchestrator/onboardingConfig';
import type { OnboardingRuntimeState } from '@core/components/onboarding/orchestrator/onboardingConfig';

/**
 * Desktop default runtime state
 * Sets isDesktopApp to true so desktop-install step is skipped
 */
export const DEFAULT_RUNTIME_STATE: OnboardingRuntimeState = {
  ...CORE_DEFAULT_RUNTIME_STATE,
  isDesktopApp: true,
};

