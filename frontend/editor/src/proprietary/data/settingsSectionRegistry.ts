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
    keywords: ["system", "config", "server"],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  {
    key: "adminFeatures",
    labelKey: "settings.configuration.features",
    labelFallback: "Features",
    keywords: ["features", "toggles", "flags"],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  {
    key: "adminStorageSharing",
    labelKey: "settings.configuration.storageSharing",
    labelFallback: "File Storage & Sharing",
    keywords: ["storage", "sharing", "files"],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  {
    key: "adminEndpoints",
    labelKey: "settings.configuration.endpoints",
    labelFallback: "Endpoints",
    keywords: ["endpoints", "api", "routes"],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  {
    key: "adminMcp",
    labelKey: "settings.configuration.mcp",
    labelFallback: "MCP Server",
    keywords: ["mcp", "server", "ai", "model context protocol"],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  {
    key: "adminDatabase",
    labelKey: "settings.configuration.database",
    labelFallback: "Database",
    keywords: ["database", "db", "backup"],
    adminArea: true,
    groupLabelKey: "settings.configuration.advanced",
    groupLabelFallback: "Advanced",
  },
  {
    key: "adminFolderAccess",
    labelKey: "settings.configuration.folderAccess",
    labelFallback: "Folder Access",
    keywords: ["folders", "access", "permissions", "scanning"],
    adminArea: true,
    groupLabelKey: "settings.server.title",
    groupLabelFallback: "Server",
  },
  {
    key: "adminAdvanced",
    labelKey: "settings.configuration.advanced",
    labelFallback: "Advanced",
    keywords: ["advanced", "expert"],
    adminArea: true,
    groupLabelKey: "settings.configuration.advanced",
    groupLabelFallback: "Advanced",
  },
  // --- AI ---
  {
    key: "adminAiGeneral",
    labelKey: "settings.ai.general",
    labelFallback: "General",
    keywords: ["ai", "assistant", "enable"],
    adminArea: true,
    groupLabelKey: "settings.ai.title",
    groupLabelFallback: "AI",
  },
  {
    key: "adminAiModels",
    labelKey: "settings.ai.models",
    labelFallback: "Models & Providers",
    keywords: ["ai", "models", "providers", "llm", "openai", "anthropic"],
    adminArea: true,
    groupLabelKey: "settings.ai.title",
    groupLabelFallback: "AI",
  },
  {
    key: "adminAiDocuments",
    labelKey: "settings.ai.documents",
    labelFallback: "Documents & RAG",
    keywords: ["ai", "rag", "embedding", "retrieval", "documents"],
    adminArea: true,
    groupLabelKey: "settings.ai.title",
    groupLabelFallback: "AI",
  },
  {
    key: "adminAiLimits",
    labelKey: "settings.ai.limits",
    labelFallback: "Limits & Performance",
    keywords: ["ai", "limits", "tokens", "rate", "performance"],
    adminArea: true,
    groupLabelKey: "settings.ai.title",
    groupLabelFallback: "AI",
  },
  // --- Security & Authentication ---
  {
    key: "adminSecurity",
    labelKey: "settings.securityAuth.security",
    labelFallback: "Security",
    keywords: ["security", "authentication", "auth", "password", "sessions"],
    adminArea: true,
    groupLabelKey: "settings.securityAuth.title",
    groupLabelFallback: "Security & sign-in",
  },
  {
    key: "adminConnections",
    labelKey: "settings.securityAuth.connections",
    labelFallback: "Connections",
    keywords: ["connections", "oauth", "sso", "integrations"],
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
  {
    key: "adminLegal",
    labelKey: "settings.policiesPrivacy.legal",
    labelFallback: "Legal",
    keywords: ["legal", "terms", "agreement"],
    adminArea: true,
    groupLabelKey: "settings.securityAuth.title",
    groupLabelFallback: "Security & sign-in",
  },
  {
    key: "adminPrivacy",
    labelKey: "settings.policiesPrivacy.privacy",
    labelFallback: "Privacy",
    keywords: ["privacy", "gdpr", "data"],
    adminArea: true,
    groupLabelKey: "settings.securityAuth.title",
    groupLabelFallback: "Security & sign-in",
  },
];
