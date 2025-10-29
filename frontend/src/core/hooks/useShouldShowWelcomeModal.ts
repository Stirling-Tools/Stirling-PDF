import { usePreferences } from '@app/contexts/PreferencesContext';
import { useIsMobile } from './useIsMobile';

export function useShouldShowWelcomeModal(): boolean {
  const { preferences } = usePreferences();
  const isMobile = useIsMobile();

  return !preferences.hasCompletedOnboarding
    && preferences.toolPanelModePromptSeen
    && !isMobile;
}
