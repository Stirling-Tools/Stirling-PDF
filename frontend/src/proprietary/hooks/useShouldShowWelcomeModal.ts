import { useMediaQuery } from '@mantine/hooks';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useAuth } from '@app/auth/UseSession';

export function useShouldShowWelcomeModal(): boolean {
  const { preferences } = usePreferences();
  const { session, loading } = useAuth();
  const isMobile = useMediaQuery("(max-width: 1024px)");

  // Only show welcome modal if user is authenticated (session exists)
  // This prevents the modal from showing on login screens when security is enabled
  return !loading
    && !preferences.hasCompletedOnboarding
    && preferences.toolPanelModePromptSeen
    && !isMobile
    && !!session;
}
