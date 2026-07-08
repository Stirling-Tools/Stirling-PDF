import { type SettingsSectionEntry } from "@core/data/settingsSectionRegistry";

export type { SettingsSectionEntry };

/**
 * SaaS web settings sections. The SaaS modal is composed differently from
 * self-hosted (see `saasConfigNavSections`): an Account area (Overview,
 * Passwords & Security, Team), Preferences, a Developer area (API Keys, MCP),
 * cloud Billing (Plan) and Legal. It deliberately does NOT list the self-hosted
 * admin sections, so search never deep-links to a tab the SaaS modal can't show.
 *
 * Entries are left ungated: the login/admin flags the super search reads come
 * from the local backend config and don't reflect SaaS auth, so gating here
 * would be unreliable. SaaS users are authenticated in practice; the anonymous
 * edge is a known Tier-0 simplification.
 */
export const SETTINGS_SECTION_REGISTRY: SettingsSectionEntry[] = [
  {
    key: "overview",
    labelKey: "config.account.overview.label",
    labelFallback: "Overview",
    keywords: ["account", "profile", "email", "avatar", "logout"],
  },
  {
    key: "security",
    labelKey: "config.account.security.title",
    labelFallback: "Passwords & Security",
    keywords: ["password", "2fa", "authentication", "sessions", "security"],
  },
  {
    key: "teams",
    labelKey: "config.team",
    labelFallback: "Team",
    keywords: ["team", "members", "invite", "seats"],
  },
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
    key: "api-keys",
    labelKey: "settings.developer.apiKeys",
    labelFallback: "API Keys",
    keywords: ["api", "token", "developer", "key"],
  },
  {
    key: "mcp",
    labelKey: "config.mcp.navLabel",
    labelFallback: "MCP Server",
    keywords: ["mcp", "server", "ai", "model context protocol"],
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
  },
  {
    key: "legal",
    labelKey: "settings.legal.label",
    labelFallback: "Legal",
    keywords: ["legal", "terms", "privacy", "licenses"],
  },
];
