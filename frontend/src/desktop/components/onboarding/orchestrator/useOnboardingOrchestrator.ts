/**
 * Desktop Override: Onboarding Orchestrator Hook
 *
 * Simply wraps the core hook with the desktop-specific default runtime state
 * which has isDesktopApp set to true.
 */

import {
  useOnboardingOrchestrator as useCoreOnboardingOrchestrator,
  type UseOnboardingOrchestratorResult,
} from '@core/components/onboarding/orchestrator/useOnboardingOrchestrator';
import { DEFAULT_RUNTIME_STATE } from '@app/components/onboarding/orchestrator/onboardingConfig';

export type {
  OnboardingOrchestratorState,
  OnboardingOrchestratorActions,
  UseOnboardingOrchestratorResult,
} from '@core/components/onboarding/orchestrator/useOnboardingOrchestrator';

export function useOnboardingOrchestrator(): UseOnboardingOrchestratorResult {
  return useCoreOnboardingOrchestrator({ defaultRuntimeState: DEFAULT_RUNTIME_STATE });
}
