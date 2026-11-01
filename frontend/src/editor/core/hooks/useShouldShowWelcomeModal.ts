import { usePreferences } from "@editor/contexts/PreferencesContext";
import { useIsMobile } from "@editor/hooks/useIsMobile";

export function useShouldShowWelcomeModal(): boolean {
  const { preferences } = usePreferences();
  const isMobile = useIsMobile();

  return (
    preferences.hasSeenIntroOnboarding &&
    !preferences.hasCompletedOnboarding &&
    preferences.toolPanelModePromptSeen &&
    !isMobile
  );
}
