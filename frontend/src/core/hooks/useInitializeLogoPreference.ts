import { useEffect } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';

export function useInitializeLogoPreference() {
  const { preferences, updatePreference } = usePreferences();
  const { config } = useAppConfig();

  useEffect(() => {
    const serverLogo = config?.logoStyle;
    if (!serverLogo) {
      return;
    }
    if (preferences.logoVariant) {
      return;
    }
    updatePreference('logoVariant', serverLogo);
  }, [config?.logoStyle, preferences.logoVariant, updatePreference]);
}

