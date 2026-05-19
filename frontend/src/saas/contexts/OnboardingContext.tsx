/**
 * SaaS stub — core onboarding is suppressed in SaaS builds.
 * OnboardingBootstrap calls these to clear any pending core tour state.
 */
export function useOnboarding() {
  return {
    clearPendingTourRequest: () => {},
    setStartAfterToolModeSelection: (_value: boolean) => {},
  };
}
