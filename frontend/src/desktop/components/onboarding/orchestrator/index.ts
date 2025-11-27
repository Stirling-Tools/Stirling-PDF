/**
 * Desktop Override: Onboarding Orchestrator
 * 
 * Re-exports with desktop-specific default runtime state.
 */

export { useOnboardingOrchestrator } from '@desktop/components/onboarding/orchestrator/useOnboardingOrchestrator';
export type {
  OnboardingOrchestratorState,
  OnboardingOrchestratorActions,
  UseOnboardingOrchestratorResult,
} from '@desktop/components/onboarding/orchestrator/useOnboardingOrchestrator';

export {
  ONBOARDING_STEPS,
  DEFAULT_RUNTIME_STATE,
  getStepById,
  getStepIndex,
} from '@desktop/components/onboarding/orchestrator/onboardingConfig';
export type {
  OnboardingStepId,
  OnboardingStepType,
  OnboardingStep,
  OnboardingRuntimeState,
  OnboardingConditionContext,
} from '@desktop/components/onboarding/orchestrator/onboardingConfig';

// Storage functions are the same - import from core
export {
  hasSeenStep,
  markStepSeen,
  resetStepSeen,
  resetAllOnboardingProgress,
  getOnboardingStorageState,
  migrateFromLegacyPreferences,
} from '@core/components/onboarding/orchestrator/onboardingStorage';

