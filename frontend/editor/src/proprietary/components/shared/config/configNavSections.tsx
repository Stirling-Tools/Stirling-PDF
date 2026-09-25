import { lazy, Suspense } from "react";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  useConfigNavSections as useCoreConfigNavSections,
  ConfigNavSection,
} from "@core/components/shared/config/configNavSections";
import AdminPlanSection from "@app/components/shared/config/configSections/AdminPlanSection";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import PreferencesSection from "@core/components/shared/config/configSections/preferences/PreferencesSection";

// Lazy, and rendered inside one Suspense below: these five pages are the bulk of
// the settings tree, and pulling them all eagerly starved the i18n fetch on a
// cold load, which left the whole page suspended.
const AdminSystemSection = lazy(
  () =>
    import("@app/components/shared/config/configSections/server/AdminSystemSection"),
);
const AdminSecurityPage = lazy(
  () =>
    import("@app/components/shared/config/configSections/security/AdminSecurityPage"),
);
const AdminAdvancedPage = lazy(
  () =>
    import("@app/components/shared/config/configSections/advanced/AdminAdvancedPage"),
);
const AdminDatabasePage = lazy(
  () =>
    import("@app/components/shared/config/configSections/advanced/AdminDatabasePage"),
);
const AdminIntegrationsPage = lazy(
  () =>
    import("@app/components/shared/config/configSections/security/AdminIntegrationsPage"),
);
const AdminLegalPrivacyPage = lazy(
  () =>
    import("@app/components/shared/config/configSections/security/AdminLegalPrivacyPage"),
);
const AdminAiSection = lazy(
  () => import("@app/components/shared/config/configSections/AdminAiSection"),
);
import AccountCards from "@core/components/shared/config/configSections/preferences/AccountCards";
import AdminAuditSection from "@app/components/shared/config/configSections/AdminAuditSection";
import AdminUsageSection from "@app/components/shared/config/configSections/AdminUsageSection";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";

/**
 * Self-hosted settings, grouped by who reaches for them and what they do there:
 * your own settings and keys, then the people and money of the workspace, then
 * what configures the server, then what only reports on it. Admin groups appear
 * for admins, and as a read-only preview when login is off and
 * system.showSettingsWhenNoLogin allows it.
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
    // Core owns the page; the flavor supplies what core has no concept of.
    preferences.items = preferences.items.map((item) =>
      item.key === "general"
        ? {
            ...item,
            component: (
              <PreferencesSection
                accountSlot={loginEnabled ? <AccountCards /> : undefined}
              />
            ),
          }
        : item,
    );
    // Keys belong to you, not to the server, so they sit with your own
    // settings rather than alone under a heading of their own.
    if (loginEnabled) {
      preferences.items.push({
        key: "api-keys",
        label: t("settings.developer.apiKeys", "API Keys"),
        description: t(
          "settings.developer.apiKeysDescription",
          "Personal keys for calling the Stirling API from scripts and integrations.",
        ),
        icon: "key",
        component: <ApiKeys />,
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
          key: "adminPlan",
          label: t("settings.licensingAnalytics.plan", "Plan"),
          description: t(
            "settings.licensingAnalytics.planDescription",
            "Your licence, seats and what the current plan unlocks.",
          ),
          icon: "star",
          component: <AdminPlanSection />,
          ...gated,
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
            label: t("settings.server.system", "System"),
            description: t(
              "admin.settings.general.description",
              "How this server runs: branding, storage, the tools it exposes, and the paths it may touch.",
            ),
            icon: "settings",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminSystemSection />
              </Suspense>
            ),
            ...gated,
          },
          {
            key: "adminSecurity",
            label: t("settings.securityAuth.security", "Sign-in & security"),
            description: t(
              "admin.settings.security.description",
              "How people sign in, how sessions are held, and what this server discloses about itself.",
            ),
            icon: "shield",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminSecurityPage />
              </Suspense>
            ),
            ...gated,
          },
          {
            key: "adminConnections",
            label: t("settings.configuration.integrations", "Integrations"),
            description: t(
              "admin.settings.connections.description",
              "Mail, Telegram, Drive, and uploading from a phone.",
            ),
            icon: "network",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminIntegrationsPage />
              </Suspense>
            ),
            ...gated,
          },
          {
            key: "adminAi",
            label: t("settings.ai.general", "AI Engine"),
            description: t(
              "admin.settings.ai.description",
              "Connect Stirling to the Python AI engine, choose its models and set its limits.",
            ),
            icon: "bot",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminAiSection />
              </Suspense>
            ),
            ...gated,
          },
          {
            key: "adminDatabase",
            label: t("settings.configuration.database", "Database"),
            description: t(
              "admin.settings.database.description",
              "Connect a custom database, and back up or restore the one in use.",
            ),
            icon: "database",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminDatabasePage />
              </Suspense>
            ),
            ...gated,
          },
          {
            key: "adminAdvanced",
            label: t("settings.configuration.advanced", "Advanced"),
            description: t(
              "admin.settings.advanced.description",
              "Feature flags, processing limits, temp files and the database. Set once at install, if ever.",
            ),
            icon: "sliders-horizontal",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminAdvancedPage />
              </Suspense>
            ),
            ...gated,
          },
          {
            key: "adminLegal",
            label: t("settings.policiesPrivacy.title", "Legal & privacy"),
            description: t(
              "admin.settings.legal.description",
              "Configure links to legal documents and policies.",
            ),
            icon: "gavel",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminLegalPrivacyPage />
              </Suspense>
            ),
            ...gated,
          },
        ],
      },
      // Split from Server because you read these rather than set them.
      {
        id: "monitoring",
        title: t("settings.monitoring.title", "Monitoring"),
        items: [
          {
            key: "adminUsage",
            label: t("settings.licensingAnalytics.usage", "Usage Analytics"),
            description: t(
              "settings.licensingAnalytics.usageDescription",
              "Endpoint usage and activity for this server.",
            ),
            icon: "chart-line",
            component: <AdminUsageSection />,
            ...gated,
          },
          {
            key: "adminAudit",
            label: t("settings.licensingAnalytics.audit", "Audit log"),
            description: t(
              "settings.licensingAnalytics.auditDescription",
              "Who did what on this server, and how long that record is kept.",
            ),
            icon: "clipboard-check",
            component: <AdminAuditSection />,
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
