import { type SettingsSectionEntry } from "@core/data/settingsSectionRegistry";

export type { SettingsSectionEntry };

/**
 * SaaS web settings sections. The SaaS modal is composed differently from
 * self-hosted (see `saasConfigNavSections`): an Account area (Overview,
 * Passwords & Security, Team), Preferences, a Developer area (API Keys, MCP),
 * cloud Billing (Plan) and Legal. It deliberately does NOT list the self-hosted
 * admin sections, so search never deep-links to a tab the SaaS modal can't show.
 *
 * The local backend's login/admin flags don't reflect SaaS auth, so entries
 * avoid `requiresLogin`/`adminArea`. Sections the SaaS nav only mounts for a
 * signed-in account (Team, Plan) carry `requiresAccount`, which the search
 * gates on the auth seam's `isAnonymous` — the signal the nav itself uses.
 */
export const SETTINGS_SECTION_REGISTRY: SettingsSectionEntry[] = [
  {
    key: "overview",
    labelKey: "config.account.overview.label",
    labelFallback: "Overview",
    keywords: ["account", "profile", "email", "avatar", "logout"],
    groupLabelKey: "config.account.overview.title",
    groupLabelFallback: "Account Settings",
  },
  {
    key: "security",
    labelKey: "config.account.security.title",
    labelFallback: "Passwords & Security",
    keywords: ["password", "2fa", "authentication", "sessions", "security"],
    groupLabelKey: "config.account.overview.title",
    groupLabelFallback: "Account Settings",
  },
  {
    key: "teams",
    labelKey: "config.team",
    labelFallback: "Team",
    keywords: ["team", "members", "invite", "seats"],
    requiresAccount: true,
    groupLabelKey: "config.account.overview.title",
    groupLabelFallback: "Account Settings",
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
    key: "api-keys",
    labelKey: "settings.developer.apiKeys",
    labelFallback: "API Keys",
    keywords: ["api", "token", "developer", "key"],
    groupLabelKey: "settings.developer.title",
    groupLabelFallback: "Developer",
  },
  {
    key: "mcp",
    labelKey: "config.mcp.navLabel",
    labelFallback: "MCP Server",
    keywords: ["mcp", "server", "ai", "model context protocol"],
    groupLabelKey: "settings.developer.title",
    groupLabelFallback: "Developer",
  },
  {
    key: "plan",
    labelKey: "config.plan",
    labelFallback: "Plan",
    keywords: [
      "billing",
      "subscription",
      "upgrade",
      "payment",
      "invoice",
      "wallet",
    ],
    requiresAccount: true,
    groupLabelKey: "settings.planBilling.title",
    groupLabelFallback: "Plan & Billing",
  },
  {
    key: "legal",
    labelKey: "settings.legal.label",
    labelFallback: "Legal",
    keywords: ["legal", "terms", "privacy", "licenses"],
    groupLabelKey: "settings.legal.title",
    groupLabelFallback: "Legal",
  },
];
