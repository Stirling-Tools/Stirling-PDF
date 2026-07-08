import { type SettingsSectionEntry } from "@core/data/settingsSectionRegistry";

export type { SettingsSectionEntry };

/**
 * Desktop settings sections. The desktop modal reflows heavily by connection
 * mode (`configNavSections`): local mode shows only Preferences + Connection
 * Mode + Legal, while SaaS mode swaps in the cloud Plan/Team sections and hides
 * the self-hosted admin area. To stay safe across both modes without threading
 * the (async) connection state into the always-mounted search, this lists only
 * the sections guaranteed to render in every desktop mode.
 *
 * Cloud Plan/Team search on desktop-SaaS is a deliberate Tier-0 gap, not a
 * regression — better to omit them than to deep-link to a dead tab in local
 * mode.
 */
export const SETTINGS_SECTION_REGISTRY: SettingsSectionEntry[] = [
  {
    key: "general",
    labelKey: "settings.general.title",
    labelFallback: "General",
    keywords: ["theme", "language", "appearance", "preferences", "startup"],
  },
  {
    key: "hotkeys",
    labelKey: "settings.hotkeys.title",
    labelFallback: "Keyboard Shortcuts",
    keywords: ["hotkey", "shortcut", "keybinding", "keyboard"],
  },
  {
    key: "connectionMode",
    labelKey: "settings.connection.title",
    labelFallback: "Connection Mode",
    keywords: ["connection", "local", "cloud", "server", "sign in"],
  },
  {
    key: "legal",
    labelKey: "settings.legal.label",
    labelFallback: "Legal",
    keywords: ["legal", "terms", "privacy", "licenses"],
  },
];
