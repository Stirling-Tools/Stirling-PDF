import { usePreferences } from '@app/contexts/PreferencesContext';
import { useIsMobile } from '@app/hooks/useIsMobile';

export function useShouldShowWelcomeModal(): boolean {
  const { preferences } = usePreferences();
  const isMobile = useIsMobile();

  return preferences.hasSeenIntroOnboarding
    && !preferences.hasCompletedOnboarding
    && preferences.toolPanelModePromptSeen
    && !isMobile;
}
