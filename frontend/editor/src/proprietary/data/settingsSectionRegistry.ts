import {
  SETTINGS_SECTION_REGISTRY as CORE_SETTINGS_SECTION_REGISTRY,
  type SettingsSectionEntry,
} from "@core/data/settingsSectionRegistry";
import { HAS_PORTAL } from "@app/routes/hasPortal";

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
    keywords: [
      "system",
      "config",
      "server",
      "features",
      "toggles",
      "flags",
      "storage",
      "sharing",
      "files",
      "folders",
      "access",
      "permissions",
      "scanning",
      "endpoints",
      "api",
      "routes",
      "mcp",
      "server",
      "ai",
      "model context protocol",
    ],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  {
    key: "adminAdvanced",
    labelKey: "settings.configuration.advanced",
    labelFallback: "Advanced",
    keywords: ["advanced", "expert", "database", "db", "backup"],
    adminArea: true,
    groupLabelKey: "settings.configuration.advanced",
    groupLabelFallback: "Advanced",
  },
  // --- AI ---
  {
    key: "adminAi",
    labelKey: "settings.ai.general",
    labelFallback: "AI Engine",
    keywords: [
      "ai",
      "assistant",
      "enable",
      "models",
      "providers",
      "llm",
      "openai",
      "anthropic",
      "rag",
      "embedding",
      "retrieval",
      "documents",
      "limits",
      "tokens",
      "rate",
      "performance",
    ],
    adminArea: true,
    groupLabelKey: "settings.ai.title",
    groupLabelFallback: "AI",
  },
  // --- Security & Authentication ---
  {
    key: "adminSecurity",
    labelKey: "settings.securityAuth.security",
    labelFallback: "Security",
    keywords: [
      "security",
      "authentication",
      "auth",
      "password",
      "sessions",
      "connections",
      "oauth",
      "sso",
      "integrations",
      "privacy",
      "gdpr",
      "data",
      "legal",
      "terms",
      "agreement",
    ],
    adminArea: true,
    groupLabelKey: "settings.securityAuth.title",
    groupLabelFallback: "Security & sign-in",
  },
  // --- Licensing & Analytics ---
  {
    key: "adminPlan",
    labelKey: "settings.licensingAnalytics.plan",
    labelFallback: "Plan",
    keywords: ["plan", "license", "billing", "subscription", "enterprise"],
    adminArea: true,
    groupLabelKey: "settings.workspace.title",
    groupLabelFallback: "Workspace",
  },
  {
    key: "adminAudit",
    labelKey: "settings.licensingAnalytics.audit",
    labelFallback: "Audit",
    keywords: ["audit", "logs", "events", "history"],
    adminArea: true,
    groupLabelKey: "settings.securityAuth.title",
    groupLabelFallback: "Security & sign-in",
  },
  {
    key: "adminUsage",
    labelKey: "settings.licensingAnalytics.usageAnalytics",
    labelFallback: "Usage Analytics",
    keywords: ["usage", "analytics", "stats", "metrics"],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  // --- Workspace (moved off the processor's own nav). Present only where the
  // nav can actually show them: a processor build, and a session that can
  // enter it. ---
  ...(HAS_PORTAL
    ? ([
        {
          key: "users",
          labelKey: "portal.nav.users",
          labelFallback: "Users",
          keywords: [
            "users",
            "members",
            "roster",
            "invite",
            "roles",
            "teams",
            "processor access",
          ],
          adminArea: true,
          requiresPortalAccess: true,
          groupLabelKey: "settings.workspace.title",
          groupLabelFallback: "Workspace",
        },
        {
          key: "billing",
          labelKey: "portal.nav.usage",
          labelFallback: "Usage & Billing",
          keywords: [
            "billing",
            "wallet",
            "credits",
            "invoice",
            "spend",
            "payg",
          ],
          adminArea: true,
          requiresPortalAccess: true,
          groupLabelKey: "settings.workspace.title",
          groupLabelFallback: "Workspace",
        },
      ] satisfies SettingsSectionEntry[])
    : []),
  // --- Policies & Privacy ---
];
