import type { ComponentType } from "react";
import type { PreferencesSectionProps } from "@editor-core/components/shared/config/configSections/preferences/PreferencesSection";

/** The platform's Preferences page. Undefined keeps the page the lower layers built. */
export const PreferencesPage:
  | ComponentType<PreferencesSectionProps>
  | undefined = undefined;
