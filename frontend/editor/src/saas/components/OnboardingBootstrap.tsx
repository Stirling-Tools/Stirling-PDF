import { useEffect } from "react";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useOnboarding } from "@app/contexts/OnboardingContext";

const ONBOARDING_SESSION_BLOCK_KEY = "stirling-onboarding-session-active";

/**
 * SaaS-only bootstrap to clear deferred tour requests and mark the tool panel
 * prompt / core intro onboarding as completed.
 *
 * First-load auto-display is disabled: the SaaS onboarding modal no longer
 * appears on first login. The modal component (SaasOnboardingModal) is retained
 * for explicit/manual triggering, but nothing opens it automatically here.
 */
export default function OnboardingBootstrap() {
  const { preferences, updatePreference } = usePreferences();
  const { clearPendingTourRequest, setStartAfterToolModeSelection } =
    useOnboarding();

  // Keep existing logic to disable core onboarding flags
  useEffect(() => {
    // Ensure tool panel preference is set so tours are never deferred.
    if (
      !preferences.toolPanelModePromptSeen ||
      !preferences.hasSelectedToolPanelMode
    ) {
      updatePreference("toolPanelModePromptSeen", true);
      updatePreference("hasSelectedToolPanelMode", true);
    }

    // Clear any lingering deferred tour requests.
    clearPendingTourRequest();
    setStartAfterToolModeSelection(false);

    // In SaaS, skip the core intro onboarding entirely.
    if (!preferences.hasSeenIntroOnboarding) {
      updatePreference("hasSeenIntroOnboarding", true);
    }
    // Also mark completed to avoid follow-up banners/modals.
    if (!preferences.hasCompletedOnboarding) {
      updatePreference("hasCompletedOnboarding", true);
    }

    // Also clear any session flag that might mark onboarding as active.
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(ONBOARDING_SESSION_BLOCK_KEY);
    }
  }, [
    preferences.hasSelectedToolPanelMode,
    preferences.toolPanelModePromptSeen,
    preferences.hasSeenIntroOnboarding,
    preferences.hasCompletedOnboarding,
    updatePreference,
    clearPendingTourRequest,
    setStartAfterToolModeSelection,
  ]);

  return null;
}
