import { type SettingsSectionEntry } from "@core/data/settingsSectionRegistry";

export type { SettingsSectionEntry };

/**
 * Desktop settings sections. The desktop modal reflows heavily by connection
 * mode (`configNavSections`): local mode shows only Preferences + Connection
 * Mode + Legal, while SaaS mode swaps in the cloud sections and hides the
 * self-hosted admin area. To stay safe across modes without threading the
 * (async) connection state into the always-mounted search, this lists the
 * sections that render in every desktop mode, plus the processor's.
 *
 * The processor's sections are listed behind portal access, the one signal
 * that is false in local mode. That under-lists Usage & Billing for Stirling
 * Cloud members without processor access, which is better than deep-linking a
 * local-mode user to a tab that is not there.
 */
export const SETTINGS_SECTION_REGISTRY: SettingsSectionEntry[] = [
  {
    key: "users",
    labelKey: "portal.nav.users",
    labelFallback: "Users",
    keywords: ["users", "people", "members", "roster", "invite", "teams"],
    requiresPortalAccess: true,
    groupLabelKey: "settings.workspace.title",
    groupLabelFallback: "Workspace",
  },
  {
    key: "billing",
    labelKey: "portal.nav.usage",
    labelFallback: "Usage & Billing",
    keywords: ["billing", "wallet", "credits", "invoice", "spend", "plan"],
    requiresPortalAccess: true,
    groupLabelKey: "settings.workspace.title",
    groupLabelFallback: "Workspace",
  },
  {
    key: "api-keys",
    labelKey: "settings.developer.apiKeys",
    labelFallback: "API Keys",
    keywords: ["api", "token", "developer", "key"],
    requiresPortalAccess: true,
    groupLabelKey: "settings.preferences.title",
    groupLabelFallback: "Preferences",
  },
  {
    key: "general",
    labelKey: "settings.general.title",
    labelFallback: "General",
    keywords: ["theme", "language", "appearance", "preferences", "startup"],
    groupLabelKey: "settings.preferences.title",
    groupLabelFallback: "Preferences",
  },
  {
    key: "hotkeys",
    labelKey: "settings.hotkeys.title",
    labelFallback: "Keyboard Shortcuts",
    keywords: ["hotkey", "shortcut", "keybinding", "keyboard"],
    groupLabelKey: "settings.preferences.title",
    groupLabelFallback: "Preferences",
  },
  {
    key: "connectionMode",
    labelKey: "settings.connection.title",
    labelFallback: "Connection Mode",
    keywords: ["connection", "local", "cloud", "server", "sign in"],
    groupLabelKey: "settings.connection.title",
    groupLabelFallback: "Connection Mode",
  },
  {
    key: "legal",
    labelKey: "settings.legal.label",
    labelFallback: "Legal",
    keywords: ["legal", "terms", "privacy", "licenses"],
    groupLabelKey: "settings.about.title",
    groupLabelFallback: "About",
  },
];
