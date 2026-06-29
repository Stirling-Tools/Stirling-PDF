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
import AdminAuditSection from "@app/components/shared/config/configSections/AdminAuditSection";
import AdminUsageSection from "@app/components/shared/config/configSections/AdminUsageSection";
import AdminStorageSharingSection from "@app/components/shared/config/configSections/AdminStorageSharingSection";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";
import AccountSection from "@app/components/shared/config/configSections/AccountSection";
import GeneralSection from "@app/components/shared/config/configSections/GeneralSection";

/**
 * Hook version of proprietary config nav sections with proper i18n support
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false,
  onRequestClose: () => void = () => {},
): ConfigNavSection[] => {
  const { t } = useTranslation();

  // Get the core sections (Preferences + Help)
  const sections = useCoreConfigNavSections(
    isAdmin,
    runningEE,
    loginEnabled,
    onRequestClose,
  );

  // Add account management under Preferences
  const preferencesSection = sections.find((section) =>
    section.items.some((item) => item.key === "general"),
  );
  if (preferencesSection) {
    preferencesSection.items = preferencesSection.items.map((item) =>
      item.key === "general"
        ? { ...item, component: <GeneralSection /> }
        : item,
    );

    if (loginEnabled) {
      preferencesSection.items.push({
        key: "account",
        label: t("account.accountSettings", "Account"),
        icon: "person-rounded",
        component: <AccountSection />,
      });
    }
  }

  // Add Admin sections if user is admin OR if login is disabled (but mark as disabled)
  if (isAdmin || !loginEnabled) {
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
          icon: "group-rounded",
          component: <PeopleSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "teams",
          label: t("settings.workspace.teams", "Teams"),
          icon: "groups-rounded",
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
          icon: "settings-rounded",
          component: <AdminGeneralSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminFeatures",
          label: t("settings.configuration.features", "Features"),
          icon: "extension-rounded",
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
          icon: "storage-rounded",
          component: <AdminStorageSharingSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
          badge: t("toolPanel.alpha", "Alpha"),
          badgeColor: "orange",
        },
        {
          key: "adminEndpoints",
          label: t("settings.configuration.endpoints", "Endpoints"),
          icon: "api-rounded",
          component: <AdminEndpointsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminMcp",
          label: t("settings.configuration.mcp", "MCP Server"),
          icon: "smart-toy-rounded",
          component: <AdminMcpSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminDatabase",
          label: t("settings.configuration.database", "Database"),
          icon: "storage-rounded",
          component: <AdminDatabaseSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminAdvanced",
          label: t("settings.configuration.advanced", "Advanced"),
          icon: "tune-rounded",
          component: <AdminAdvancedSection />,
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
          icon: "shield-rounded",
          component: <AdminSecuritySection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminConnections",
          label: t("settings.securityAuth.connections", "Connections"),
          icon: "link-rounded",
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
          icon: "star-rounded",
          component: <AdminPlanSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminAudit",
          label: t("settings.licensingAnalytics.audit", "Audit"),
          icon: "fact-check-rounded",
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
          icon: "analytics-rounded",
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
          icon: "gavel-rounded",
          component: <AdminLegalSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined,
        },
        {
          key: "adminPrivacy",
          label: t("settings.policiesPrivacy.privacy", "Privacy"),
          icon: "visibility-rounded",
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
          icon: "key-rounded",
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
