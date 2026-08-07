import { useMemo } from "react";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import type { LogoVariant } from "@editor/services/preferencesService";
import { ensureLogoVariant } from "@editor/constants/logo";

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
