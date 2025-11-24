import { useMemo } from 'react';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';
import type { LogoVariant } from '@app/services/preferencesService';
import { ensureLogoVariant } from '@app/constants/logo';

export function useLogoVariant(): LogoVariant {
  const { preferences } = usePreferences();
  const { config } = useAppConfig();

  return useMemo(() => {
    // Check local storage first, then fall back to server config
    const preferenceVariant = preferences.logoVariant;
    const configVariant = config?.logoStyle;
    return ensureLogoVariant(preferenceVariant ?? configVariant);
  }, [config?.logoStyle, preferences.logoVariant]);
}

