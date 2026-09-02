import React from "react";
import { useTranslation } from "react-i18next";
import {
  useConfigNavSections as useCoreConfigNavSections,
  ConfigNavSection,
} from "@core/components/shared/config/configNavSections";
import PeopleSection from "@app/components/shared/config/configSections/PeopleSection";
import TeamsSection from "@app/components/shared/config/configSections/TeamsSection";
import AdminGeneralSection from "@app/components/shared/config/configSections/AdminGeneralSection";
import AdminSecuritySection from "@app/components/shared/config/configSections/AdminSecuritySection";
import AdminConnectionsSection from "@app/components/shared/config/configSections/AdminConnectionsSection";
import AdminPrivacySection from "@app/components/shared/config/configSections/AdminPrivacySection";
import AdminDatabaseSection from "@app/components/shared/config/configSections/AdminDatabaseSection";
import AdminAdvancedSection from "@app/components/shared/config/configSections/AdminAdvancedSection";
import AdminLegalSection from "@app/components/shared/config/configSections/AdminLegalSection";
import AdminPlanSection from "@app/components/shared/config/configSections/AdminPlanSection";
import AdminFeaturesSection from "@app/components/shared/config/configSections/AdminFeaturesSection";
import AdminEndpointsSection from "@app/components/shared/config/configSections/AdminEndpointsSection";
import AdminMcpSection from "@app/components/shared/config/configSections/AdminMcpSection";
import AdminAiGeneralSection from "@app/components/shared/config/configSections/AdminAiGeneralSection";
import AdminAiModelsSection from "@app/components/shared/config/configSections/AdminAiModelsSection";
import AdminAiDocumentsSection from "@app/components/shared/config/configSections/AdminAiDocumentsSection";
import AdminAiLimitsSection from "@app/components/shared/config/configSections/AdminAiLimitsSection";
import AdminAuditSection from "@app/components/shared/config/configSections/AdminAuditSection";
import AdminUsageSection from "@app/components/shared/config/configSections/AdminUsageSection";
import AdminStorageSharingSection from "@app/components/shared/config/configSections/AdminStorageSharingSection";
import AdminFolderAccessSection from "@app/components/shared/config/configSections/AdminFolderAccessSection";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";
import AccountSection from "@app/components/shared/config/configSections/AccountSection";
import GeneralWithLoginLanding from "@app/components/shared/config/GeneralWithLoginLanding";

/**
 * Self-hosted settings, grouped by who reaches for them: you, then the people
 * and money of the workspace, then the server itself, its security, AI, and
 * finally the knobs almost nobody turns (folded by default) and the small
 * print. Admin groups appear for admins, and as a read-only preview when login
 * is off and system.showSettingsWhenNoLogin allows it.
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false,
  onRequestClose: () => void = () => {},
  showSettingsWhenNoLogin: boolean = true,
): ConfigNavSection[] => {
  const { t } = useTranslation();

  // Core ships Preferences and About; About is the small print and stays last.
  const coreSections = useCoreConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled,
    onRequestClose,
    showSettingsWhenNoLogin,
  );
  const about = coreSections.filter((s) => s.id === "about");
  const sections = coreSections.filter((s) => s.id !== "about");

  const preferences = sections.find((s) => s.id === "preferences");
  if (preferences) {
    preferences.items = preferences.items.map((item) =>
      item.key === "general"
        ? { ...item, component: <GeneralWithLoginLanding hideTitle /> }
        : item,
    );
    if (loginEnabled) {
      preferences.items.push({
        key: "account",
        label: t("account.accountSettings", "Account"),
        description: t("changeCreds.header", "Update Your Account Details"),
        icon: "person-rounded",
        component: <AccountSection />,
      });
    }
  }

  const showAdmin = isAdmin || (!loginEnabled && showSettingsWhenNoLogin);
  const requiresLogin = !loginEnabled;
  const enableLoginTooltip = t(
    "settings.tooltips.enableLoginFirst",
    "Enable login mode first",
  );
  const gated = {
    disabled: requiresLogin,
    disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
  };

  if (showAdmin) {
    sections.push({
      id: "workspace",
      title: t("settings.workspace.title", "Workspace"),
      items: [
        {
          key: "people",
          label: t("settings.workspace.people", "People"),
          description: t(
            "workspace.people.description",
            "Everyone with an account on this server, their role and their team.",
          ),
          icon: "group-rounded",
          component: <PeopleSection />,
          ...gated,
        },
        {
          key: "teams",
          label: t("settings.workspace.teams", "Teams"),
          description: t(
            "workspace.teams.description",
            "Group people into teams and manage who belongs where.",
          ),
          icon: "groups-rounded",
          component: <TeamsSection />,
          ...gated,
        },
        {
          key: "adminPlan",
          label: t("settings.licensingAnalytics.plan", "Plan"),
          description: t(
            "settings.licensingAnalytics.planDescription",
            "Your licence, seats and what the current plan unlocks.",
          ),
          icon: "star-rounded",
          component: <AdminPlanSection />,
          ...gated,
        },
      ],
    });
  }

  if (loginEnabled) {
    sections.push({
      id: "developer",
      title: t("settings.developer.title", "Developer"),
      items: [
        {
          key: "api-keys",
          label: t("settings.developer.apiKeys", "API Keys"),
          description: t(
            "settings.developer.apiKeysDescription",
            "Personal keys for calling the Stirling API from scripts and integrations.",
          ),
          icon: "key-rounded",
          component: <ApiKeys />,
        },
      ],
    });
  }

  if (showAdmin) {
    sections.push(
      {
        id: "server",
        title: t("settings.server.title", "Server"),
        items: [
          {
            key: "adminGeneral",
            label: t(
              "settings.configuration.systemSettings",
              "System Settings",
            ),
            description: t(
              "admin.settings.general.description",
              "Configure system-wide application settings including branding and default behaviour.",
            ),
            icon: "settings-rounded",
            component: <AdminGeneralSection />,
            ...gated,
          },
          {
            key: "adminFeatures",
            label: t("settings.configuration.features", "Features"),
            description: t(
              "admin.settings.features.description",
              "Configure optional features and functionality.",
            ),
            icon: "extension-rounded",
            component: <AdminFeaturesSection />,
            ...gated,
          },
          {
            key: "adminStorageSharing",
            label: t(
              "settings.configuration.storageSharing",
              "File Storage & Sharing",
            ),
            description: t(
              "admin.settings.storage.description",
              "Control server storage and sharing options.",
            ),
            icon: "storage-rounded",
            component: <AdminStorageSharingSection />,
            ...gated,
            badge: t("toolPanel.alpha", "Alpha"),
            badgeColor: "orange",
          },
          {
            key: "adminFolderAccess",
            label: t("settings.configuration.folderAccess", "Folder Access"),
            description: t(
              "admin.settings.folderAccess.description",
              "Directories that folder sources and folder outputs are allowed to read from and write to. This is a security boundary: automations can never be pointed at a server path outside this list.",
            ),
            icon: "folder-rounded",
            component: <AdminFolderAccessSection />,
            ...gated,
          },
          {
            key: "adminEndpoints",
            label: t("settings.configuration.endpoints", "Endpoints"),
            description: t(
              "admin.settings.endpoints.description",
              "Control which API endpoints and endpoint groups are available.",
            ),
            icon: "api-rounded",
            component: <AdminEndpointsSection />,
            ...gated,
          },
          {
            key: "adminMcp",
            label: t("settings.configuration.mcp", "MCP Server"),
            description: t(
              "admin.settings.mcp.description",
              "Expose Stirling's PDF tools and AI agents to MCP clients over an OAuth-protected endpoint.",
            ),
            icon: "smart-toy-rounded",
            component: <AdminMcpSection />,
            ...gated,
          },
          {
            key: "adminUsage",
            label: t(
              "settings.licensingAnalytics.usageAnalytics",
              "Usage Analytics",
            ),
            description: t(
              "settings.licensingAnalytics.usageDescription",
              "How the server is being used: operations, volume and trends over time.",
            ),
            icon: "analytics-rounded",
            component: <AdminUsageSection />,
            // Non-Enterprise users can still click in: the section renders a
            // demo preview when `!hasEnterpriseLicense`.
            ...gated,
          },
        ],
      },
      {
        id: "security",
        title: t("settings.securityAuth.title", "Security & sign-in"),
        items: [
          {
            key: "adminSecurity",
            label: t("settings.securityAuth.security", "Sign-in & security"),
            description: t(
              "admin.settings.security.description",
              "Configure authentication, login behaviour, and security policies.",
            ),
            icon: "shield-rounded",
            component: <AdminSecuritySection />,
            ...gated,
          },
          {
            key: "adminConnections",
            label: t("settings.securityAuth.connections", "Single sign-on"),
            description: t(
              "admin.settings.connections.description",
              "Configure external authentication providers like OAuth2 and SAML.",
            ),
            icon: "link-rounded",
            component: <AdminConnectionsSection />,
            ...gated,
          },
          {
            key: "adminPrivacy",
            label: t("settings.policiesPrivacy.privacy", "Privacy"),
            description: t(
              "admin.settings.privacy.description",
              "Configure privacy and data collection settings.",
            ),
            icon: "visibility-rounded",
            component: <AdminPrivacySection />,
            ...gated,
          },
          {
            key: "adminLegal",
            label: t("settings.policiesPrivacy.legal", "Legal documents"),
            description: t(
              "admin.settings.legal.description",
              "Configure links to legal documents and policies.",
            ),
            icon: "gavel-rounded",
            component: <AdminLegalSection />,
            ...gated,
          },
          {
            key: "adminAudit",
            label: t("settings.licensingAnalytics.audit", "Audit log"),
            description: t(
              "settings.licensingAnalytics.auditDescription",
              "Who did what on this server, and how long that record is kept.",
            ),
            icon: "fact-check-rounded",
            component: <AdminAuditSection />,
            // Same demo-preview story as adminUsage above.
            ...gated,
          },
        ],
      },
      {
        id: "ai",
        title: t("settings.ai.title", "AI"),
        items: [
          {
            key: "adminAiGeneral",
            label: t("settings.ai.general", "AI Engine"),
            description: t(
              "admin.settings.ai.general.description",
              "Connect Stirling to the Python AI engine and choose which AI capabilities are exposed. Changes apply on restart.",
            ),
            icon: "smart-toy-rounded",
            component: <AdminAiGeneralSection />,
            ...gated,
          },
          {
            key: "adminAiModels",
            label: t("settings.ai.models", "Models & Providers"),
            description: t(
              "admin.settings.ai.models.description",
              "Choose the LLM provider and the smart/fast models the AI engine uses. Applied to the AI engine when saved.",
            ),
            icon: "psychology",
            component: <AdminAiModelsSection />,
            ...gated,
          },
          {
            key: "adminAiDocuments",
            label: t("settings.ai.documents", "Documents & RAG"),
            description: t(
              "admin.settings.ai.documents.description",
              "Configure the embedding model and retrieval settings used to answer questions over documents. Applied to the AI engine when saved.",
            ),
            icon: "description",
            component: <AdminAiDocumentsSection />,
            ...gated,
          },
          {
            key: "adminAiLimits",
            label: t("settings.ai.limits", "Limits & Performance"),
            description: t(
              "admin.settings.ai.limits.description",
              "Guardrails for how much work AI requests may do and how many run concurrently. Applied to the AI engine when saved.",
            ),
            icon: "speed",
            component: <AdminAiLimitsSection />,
            ...gated,
          },
        ],
      },
      // Changed once at install time, if ever: folded so the list stays short.
      {
        id: "advanced",
        title: t("settings.configuration.advanced", "Advanced"),
        collapsedByDefault: true,
        items: [
          {
            key: "adminDatabase",
            label: t("settings.configuration.database", "Database"),
            description: t(
              "admin.settings.database.description",
              "Configure custom database connection settings for enterprise deployments.",
            ),
            icon: "storage-rounded",
            component: <AdminDatabaseSection />,
            ...gated,
          },
          {
            key: "adminAdvanced",
            label: t("settings.configuration.advanced", "Advanced"),
            description: t(
              "admin.settings.advanced.description",
              "Configure advanced features and experimental functionality.",
            ),
            icon: "tune-rounded",
            component: <AdminAdvancedSection />,
            ...gated,
          },
        ],
      },
    );
  }

  return [...sections, ...about];
};

// Re-export types for convenience
export type {
  ConfigNavSection,
  ConfigNavItem,
  ConfigColors,
} from "@core/components/shared/config/configNavSections";
