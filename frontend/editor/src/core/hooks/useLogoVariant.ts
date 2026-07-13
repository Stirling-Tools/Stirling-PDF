import { useMemo } from "react";
import { usePreferencesOptional } from "@app/contexts/PreferencesContext";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import type { LogoVariant } from "@app/services/preferencesService";
import { ensureLogoVariant } from "@app/constants/logo";

export function useLogoVariant(): LogoVariant {
  // Optional: this hook (via useLogoAssets/Tooltip) can render outside a
  // PreferencesProvider, e.g. in the Processor portal. Fall back to the
  // server config, then the default variant, when preferences are absent.
  const prefs = usePreferencesOptional();
  const { config } = useAppConfig();

  return useMemo(() => {
    // Check local storage first, then fall back to server config
    const preferenceVariant = prefs?.preferences.logoVariant;
    const configVariant = config?.logoStyle;
    return ensureLogoVariant(preferenceVariant ?? configVariant);
  }, [config?.logoStyle, prefs?.preferences.logoVariant]);
}
