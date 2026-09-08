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
 * Hook version of proprietary config nav sections with proper i18n support
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false,
  onRequestClose: () => void = () => {},
  showSettingsWhenNoLogin: boolean = true,
): ConfigNavSection[] => {
  const { t } = useTranslation();

  // Get the core sections (Preferences + Help)
  const sections = useCoreConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled,
    onRequestClose,
    showSettingsWhenNoLogin,
  );

  // Add account management under Preferences
  const preferencesSection = sections.find((section) =>
    section.items.some((item) => item.key === "general"),
  );
  if (preferencesSection) {
    preferencesSection.items = preferencesSection.items.map((item) =>
      item.key === "general"
        ? { ...item, component: <GeneralWithLoginLanding hideTitle /> }
        : item,
    );

    if (loginEnabled) {
      preferencesSection.items.push({
        key: "account",
        label: t("account.accountSettings", "Account"),
        icon: "user",
        component: <AccountSection />,
      });
    }
  }

  // Add Admin sections for admins. When login is disabled, keep the historical
  // read-only admin preview only if system.showSettingsWhenNoLogin allows it.
  if (isAdmin || (!loginEnabled && showSettingsWhenNoLogin)) {
    const requiresLogin = !loginEnabled;
    const enableLoginTooltip = t(
      "settings.tooltips.enableLoginFirst",
      "Enable login mode first",
    );

    // Workspace
    sections.push({
      title: t("settings.workspace.title", "Workspace"),
      items: [
        {
          key: "people",
          label: t("settings.workspace.people", "People"),
          icon: "users",
          component: <PeopleSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "teams",
          label: t("settings.workspace.teams", "Teams"),
          icon: "users",
          component: <TeamsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
      ],
    });

    // Configuration
    sections.push({
      title: t("settings.configuration.title", "Configuration"),
      items: [
        {
          key: "adminGeneral",
          label: t("settings.configuration.systemSettings", "System Settings"),
          icon: "settings",
          component: <AdminGeneralSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminFeatures",
          label: t("settings.configuration.features", "Features"),
          icon: "puzzle",
          component: <AdminFeaturesSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminStorageSharing",
          label: t(
            "settings.configuration.storageSharing",
            "File Storage & Sharing",
          ),
          icon: "server",
          component: <AdminStorageSharingSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
          badge: t("toolPanel.alpha", "Alpha"),
          badgeColor: "orange",
        },
        {
          key: "adminFolderAccess",
          label: t("settings.configuration.folderAccess", "Folder Access"),
          icon: "folder",
          component: <AdminFolderAccessSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminEndpoints",
          label: t("settings.configuration.endpoints", "Endpoints"),
          icon: "api",
          component: <AdminEndpointsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminMcp",
          label: t("settings.configuration.mcp", "MCP Server"),
          icon: "bot",
          component: <AdminMcpSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminDatabase",
          label: t("settings.configuration.database", "Database"),
          icon: "server",
          component: <AdminDatabaseSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminAdvanced",
          label: t("settings.configuration.advanced", "Advanced"),
          icon: "sliders-horizontal",
          component: <AdminAdvancedSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
      ],
    });

    // AI
    sections.push({
      title: t("settings.ai.title", "AI"),
      items: [
        {
          key: "adminAiGeneral",
          label: t("settings.ai.general", "General"),
          icon: "bot",
          component: <AdminAiGeneralSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminAiModels",
          label: t("settings.ai.models", "Models & Providers"),
          icon: "brain",
          component: <AdminAiModelsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminAiDocuments",
          label: t("settings.ai.documents", "Documents & RAG"),
          icon: "file-text",
          component: <AdminAiDocumentsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminAiLimits",
          label: t("settings.ai.limits", "Limits & Performance"),
          icon: "gauge",
          component: <AdminAiLimitsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
      ],
    });

    // Security & Authentication
    sections.push({
      title: t("settings.securityAuth.title", "Security & Authentication"),
      items: [
        {
          key: "adminSecurity",
          label: t("settings.securityAuth.security", "Security"),
          icon: "shield",
          component: <AdminSecuritySection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminConnections",
          label: t("settings.securityAuth.connections", "Connections"),
          icon: "link",
          component: <AdminConnectionsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
      ],
    });

    // Licensing & Analytics
    sections.push({
      title: t("settings.licensingAnalytics.title", "Licensing & Analytics"),
      items: [
        {
          key: "adminPlan",
          label: t("settings.licensingAnalytics.plan", "Plan"),
          icon: "star",
          component: <AdminPlanSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminAudit",
          label: t("settings.licensingAnalytics.audit", "Audit"),
          icon: "clipboard-check",
          component: <AdminAuditSection />,
          // Non-Enterprise users can still click in: AdminAuditSection
          // renders a demo preview when `!hasEnterpriseLicense`.
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminUsage",
          label: t(
            "settings.licensingAnalytics.usageAnalytics",
            "Usage Analytics",
          ),
          icon: "chart-column",
          component: <AdminUsageSection />,
          // Same demo-preview story as adminAudit above.
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
      ],
    });

    // Policies & Privacy
    sections.push({
      title: t("settings.policiesPrivacy.title", "Policies & Privacy"),
      items: [
        {
          key: "adminLegal",
          label: t("settings.policiesPrivacy.legal", "Legal"),
          icon: "gavel",
          component: <AdminLegalSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminPrivacy",
          label: t("settings.policiesPrivacy.privacy", "Privacy"),
          icon: "eye",
          component: <AdminPrivacySection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
      ],
    });
  }

  // Add Developer section if login is enabled
  if (loginEnabled) {
    const developerSection: ConfigNavSection = {
      title: t("settings.developer.title", "Developer"),
      items: [
        {
          key: "api-keys",
          label: t("settings.developer.apiKeys", "API Keys"),
          icon: "key",
          component: <ApiKeys />,
        },
      ],
    };

    // Add Developer section after Preferences (or Workspace if it exists)
    const insertIndex = isAdmin ? 2 : 1;
    sections.splice(insertIndex, 0, developerSection);
  }

  return sections;
};

// Re-export types for convenience
export type {
  ConfigNavSection,
  ConfigNavItem,
  ConfigColors,
} from "@core/components/shared/config/configNavSections";
