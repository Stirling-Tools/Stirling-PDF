import { useEffect, useState } from "react";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useOnboarding } from "@app/contexts/OnboardingContext";
import { useAuth } from "@app/auth/UseSession";
import SaasOnboardingModal from "@app/components/onboarding/SaasOnboardingModal";

const STORAGE_KEY = "saas_onboarding_seen";
const ONBOARDING_SESSION_BLOCK_KEY = "stirling-onboarding-session-active";

/**
 * SaaS-only bootstrap to clear deferred tour requests, mark tool panel prompt as completed,
 * and show SaaS-specific onboarding on first login.
 */
export default function OnboardingBootstrap() {
  const { preferences, updatePreference } = usePreferences();
  const { clearPendingTourRequest, setStartAfterToolModeSelection } =
    useOnboarding();
  const { user, loading, trialStatus, isPro, refreshTrialStatus } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);

  // Start polling when user logs in
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem(STORAGE_KEY) === "true";

    if (user && !hasSeenOnboarding && !loading && !isPolling && !showModal) {
      console.debug("[Onboarding] Starting poll for trial data");
      setIsPolling(true);
      setPollAttempts(0);
    }
  }, [user, loading, isPolling, showModal]);

  // Poll for trial data
  useEffect(() => {
    if (!isPolling) return;

    const pollInterval = 500; // Check every 500ms

    const timer = setTimeout(async () => {
      const newAttempts = pollAttempts + 1;
      console.debug(
        "[Onboarding] Polling for trial data, attempt:",
        newAttempts,
      );

      await refreshTrialStatus();
      setPollAttempts(newAttempts);

      // Check will happen in the next effect
    }, pollInterval);

    return () => clearTimeout(timer);
  }, [isPolling, pollAttempts, refreshTrialStatus]);

  // Stop polling when data arrives or timeout
  useEffect(() => {
    if (!isPolling) return;

    const hasData = trialStatus !== undefined && trialStatus !== null;
    const hasProStatus = isPro !== null;
    const maxAttempts = 10;

    if (hasData || pollAttempts >= maxAttempts) {
      console.debug("[Onboarding] Trial data ready or timeout, showing modal", {
        hasData,
        hasProStatus,
        attempts: pollAttempts,
        trialStatus,
        isPro,
      });
      setIsPolling(false);
      setShowModal(true);
    }
  }, [isPolling, trialStatus, isPro, pollAttempts]);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setShowModal(false);
  };

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

  // Only render modal when it should be shown to avoid running hooks unnecessarily
  return showModal ? (
    <SaasOnboardingModal opened={showModal} onClose={handleClose} />
  ) : null;
}
