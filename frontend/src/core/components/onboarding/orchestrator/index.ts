/**
 * Onboarding Orchestrator
 * 
 * Export all orchestrator utilities for use by the Onboarding component.
 */

export { useOnboardingOrchestrator } from '@app/components/onboarding/orchestrator/useOnboardingOrchestrator';
export type {
  OnboardingOrchestratorState,
  OnboardingOrchestratorActions,
  UseOnboardingOrchestratorResult,
} from '@app/components/onboarding/orchestrator/useOnboardingOrchestrator';

export {
  ONBOARDING_STEPS,
  DEFAULT_RUNTIME_STATE,
  getStepById,
  getStepIndex,
} from '@app/components/onboarding/orchestrator/onboardingConfig';
export type {
  OnboardingStepId,
  OnboardingStepType,
  OnboardingStep,
  OnboardingRuntimeState,
  OnboardingConditionContext,
} from '@app/components/onboarding/orchestrator/onboardingConfig';

export {
  hasSeenStep,
  markStepSeen,
  resetStepSeen,
  resetAllOnboardingProgress,
  getOnboardingStorageState,
  migrateFromLegacyPreferences,
} from '@app/components/onboarding/orchestrator/onboardingStorage';

