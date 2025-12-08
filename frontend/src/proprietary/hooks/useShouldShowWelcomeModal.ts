import { usePreferences } from '@app/contexts/PreferencesContext';
import { useAuth } from '@app/auth/UseSession';
import { useIsMobile } from '@app/hooks/useIsMobile';

export function useShouldShowWelcomeModal(): boolean {
  const { preferences } = usePreferences();
  const { session, loading } = useAuth();
  const isMobile = useIsMobile();

  // Only show welcome modal if user is authenticated (session exists)
  // This prevents the modal from showing on login screens when security is enabled
  return !loading
    && !preferences.hasCompletedOnboarding
    && preferences.toolPanelModePromptSeen
    && !isMobile
    && !!session;
}
