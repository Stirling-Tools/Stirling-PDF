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
  const { user, loading } = useAuth();
  const [showModal, setShowModal] = useState(false);

  // Show the onboarding modal once on first login, after the user has loaded.
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem(STORAGE_KEY) === "true";
    if (user && !hasSeenOnboarding && !loading && !showModal) {
      setShowModal(true);
    }
  }, [user, loading, showModal]);

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
