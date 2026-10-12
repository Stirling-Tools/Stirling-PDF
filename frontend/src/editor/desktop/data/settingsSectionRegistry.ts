import {
  SETTINGS_SECTION_REGISTRY as CORE_SETTINGS_SECTION_REGISTRY,
  type SettingsSectionEntry,
} from "@core/data/settingsSectionRegistry";

export type { SettingsSectionEntry };

/**
 * Desktop settings sections. The desktop nav reflows heavily by connection
 * mode (`configNavSections`): local mode shows only Preferences + Connection
 * Mode + About, while SaaS mode swaps in the cloud Plan/Team sections and hides
 * the self-hosted admin area. To stay safe across both modes without threading
 * the (async) connection state into the always-mounted search, this lists only
 * the sections guaranteed to render in every desktop mode.
 *
 * Cloud Plan/Team search on desktop-SaaS is a deliberate Tier-0 gap, not a
 * regression: better to omit them than to deep-link to a dead tab in local
 * mode.
 */
export const SETTINGS_SECTION_REGISTRY: SettingsSectionEntry[] = [
  ...CORE_SETTINGS_SECTION_REGISTRY,
  {
    key: "connectionMode",
    labelKey: "settings.connection.title",
    labelFallback: "Connection Mode",
    keywords: ["connection", "local", "cloud", "server", "sign in"],
    groupLabelKey: "settings.connection.title",
    groupLabelFallback: "Connection Mode",
  },
];
