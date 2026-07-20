import {
  SETTINGS_SECTION_REGISTRY as CORE_SETTINGS_SECTION_REGISTRY,
  type SettingsSectionEntry,
} from "@core/data/settingsSectionRegistry";

export type { SettingsSectionEntry };

/**
 * Self-hosted (proprietary) settings sections. Extends the core list with the
 * account tab, the developer API keys tab, and the admin area — mirroring the
 * sections added by the proprietary nav builder (`configNavSections`). Keep the
 * two in sync: a section here that the modal can't render would deep-link to a
 * dead tab, and a modal section missing here isn't searchable.
 *
 * Gating flags mirror the builder: `account`/`api-keys` need login; the admin
 * sections are surfaced when the user is an admin OR login mode is off.
 */
export const SETTINGS_SECTION_REGISTRY: SettingsSectionEntry[] = [
  ...CORE_SETTINGS_SECTION_REGISTRY,
  {
    key: "account",
    labelKey: "account.accountSettings",
    labelFallback: "Account",
    keywords: ["profile", "email", "password", "user"],
    requiresLogin: true,
    groupLabelKey: "settings.preferences.title",
    groupLabelFallback: "Preferences",
  },
  {
    key: "api-keys",
    labelKey: "settings.developer.apiKeys",
    labelFallback: "API Keys",
    keywords: ["api", "token", "developer", "key"],
    requiresLogin: true,
    groupLabelKey: "settings.developer.title",
    groupLabelFallback: "Developer",
  },
  // --- Workspace ---
  {
    key: "people",
    labelKey: "settings.workspace.people",
    labelFallback: "People",
    keywords: ["members", "users", "invite", "add member", "roles"],
    adminArea: true,
    groupLabelKey: "settings.workspace.title",
    groupLabelFallback: "Workspace",
  },
  {
    key: "teams",
    labelKey: "settings.workspace.teams",
    labelFallback: "Teams",
    keywords: ["team", "group", "create team"],
    adminArea: true,
    groupLabelKey: "settings.workspace.title",
    groupLabelFallback: "Workspace",
  },
  // --- Configuration ---
  {
    key: "adminGeneral",
    labelKey: "settings.configuration.systemSettings",
    labelFallback: "System Settings",
    keywords: ["system", "config", "server"],
    adminArea: true,
    groupLabelKey: "settings.configuration.title",
    groupLabelFallback: "Configuration",
  },
  {
    key: "adminFeatures",
    labelKey: "settings.configuration.features",
    labelFallback: "Features",
    keywords: ["features", "toggles", "flags"],
    adminArea: true,
    groupLabelKey: "settings.configuration.title",
    groupLabelFallback: "Configuration",
  },
  {
    key: "adminStorageSharing",
    labelKey: "settings.configuration.storageSharing",
    labelFallback: "File Storage & Sharing",
    keywords: ["storage", "sharing", "files"],
    adminArea: true,
    groupLabelKey: "settings.configuration.title",
    groupLabelFallback: "Configuration",
  },
  {
    key: "adminEndpoints",
    labelKey: "settings.configuration.endpoints",
    labelFallback: "Endpoints",
    keywords: ["endpoints", "api", "routes"],
    adminArea: true,
    groupLabelKey: "settings.configuration.title",
    groupLabelFallback: "Configuration",
  },
  {
    key: "adminMcp",
    labelKey: "settings.configuration.mcp",
    labelFallback: "MCP Server",
    keywords: ["mcp", "server", "ai", "model context protocol"],
    adminArea: true,
    groupLabelKey: "settings.configuration.title",
    groupLabelFallback: "Configuration",
  },
  {
    key: "adminDatabase",
    labelKey: "settings.configuration.database",
    labelFallback: "Database",
    keywords: ["database", "db", "backup"],
    adminArea: true,
    groupLabelKey: "settings.configuration.title",
    groupLabelFallback: "Configuration",
  },
  {
    key: "adminAdvanced",
    labelKey: "settings.configuration.advanced",
    labelFallback: "Advanced",
    keywords: ["advanced", "expert"],
    adminArea: true,
    groupLabelKey: "settings.configuration.title",
    groupLabelFallback: "Configuration",
  },
  // --- Security & Authentication ---
  {
    key: "adminSecurity",
    labelKey: "settings.securityAuth.security",
    labelFallback: "Security",
    keywords: ["security", "authentication", "auth", "password", "sessions"],
    adminArea: true,
    groupLabelKey: "settings.securityAuth.title",
    groupLabelFallback: "Security & Authentication",
  },
  {
    key: "adminConnections",
    labelKey: "settings.securityAuth.connections",
    labelFallback: "Connections",
    keywords: ["connections", "oauth", "sso", "integrations"],
    adminArea: true,
    groupLabelKey: "settings.securityAuth.title",
    groupLabelFallback: "Security & Authentication",
  },
  // --- Licensing & Analytics ---
  {
    key: "adminPlan",
    labelKey: "settings.licensingAnalytics.plan",
    labelFallback: "Plan",
    keywords: ["plan", "license", "billing", "subscription", "enterprise"],
    adminArea: true,
    groupLabelKey: "settings.licensingAnalytics.title",
    groupLabelFallback: "Licensing & Analytics",
  },
  {
    key: "adminAudit",
    labelKey: "settings.licensingAnalytics.audit",
    labelFallback: "Audit",
    keywords: ["audit", "logs", "events", "history"],
    adminArea: true,
    groupLabelKey: "settings.licensingAnalytics.title",
    groupLabelFallback: "Licensing & Analytics",
  },
  {
    key: "adminUsage",
    labelKey: "settings.licensingAnalytics.usageAnalytics",
    labelFallback: "Usage Analytics",
    keywords: ["usage", "analytics", "stats", "metrics"],
    adminArea: true,
    groupLabelKey: "settings.licensingAnalytics.title",
    groupLabelFallback: "Licensing & Analytics",
  },
  // --- Policies & Privacy ---
  {
    key: "adminLegal",
    labelKey: "settings.policiesPrivacy.legal",
    labelFallback: "Legal",
    keywords: ["legal", "terms", "agreement"],
    adminArea: true,
    groupLabelKey: "settings.policiesPrivacy.title",
    groupLabelFallback: "Policies & Privacy",
  },
  {
    key: "adminPrivacy",
    labelKey: "settings.policiesPrivacy.privacy",
    labelFallback: "Privacy",
    keywords: ["privacy", "gdpr", "data"],
    adminArea: true,
    groupLabelKey: "settings.policiesPrivacy.title",
    groupLabelFallback: "Policies & Privacy",
  },
];
