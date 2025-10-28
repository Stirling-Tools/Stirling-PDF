import { useMediaQuery } from '@mantine/hooks';
import { usePreferences } from '@app/contexts/PreferencesContext';

export function useShouldShowWelcomeModal(): boolean {
  const { preferences } = usePreferences();
  const isMobile = useMediaQuery("(max-width: 1024px)");

  return !preferences.hasCompletedOnboarding
    && preferences.toolPanelModePromptSeen
    && !isMobile;
}
