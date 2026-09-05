import { lazy, Suspense } from "react";
import React from "react";
import { useTranslation } from "react-i18next";
import {
  useConfigNavSections as useCoreConfigNavSections,
  ConfigNavSection,
} from "@core/components/shared/config/configNavSections";
import PeopleSection from "@app/components/shared/config/configSections/PeopleSection";
import TeamsSection from "@app/components/shared/config/configSections/TeamsSection";
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
import { LoginLandingSetting } from "@app/components/shared/config/LoginLandingSetting";
import AdminAuditSection from "@app/components/shared/config/configSections/AdminAuditSection";
import AdminUsageSection from "@app/components/shared/config/configSections/AdminUsageSection";
import ApiKeys from "@app/components/shared/config/configSections/ApiKeys";

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
    // Core owns the page; the flavor supplies what core has no concept of.
    preferences.items = preferences.items.map((item) =>
      item.key === "general"
        ? {
            ...item,
            component: (
              <PreferencesSection
                editorDefaultsSlot={<LoginLandingSetting />}
                accountSlot={loginEnabled ? <AccountCards /> : undefined}
              />
            ),
          }
        : item,
    );
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
            label: t("settings.server.system", "System"),
            description: t(
              "admin.settings.general.description",
              "How this server runs: branding, storage, the tools it exposes, and the paths it may touch.",
            ),
            icon: "settings-rounded",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminSystemSection />
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
            icon: "database-rounded",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminDatabasePage />
              </Suspense>
            ),
            ...gated,
          },
          {
            key: "adminUsage",
            label: t("settings.licensingAnalytics.usage", "Usage Analytics"),
            description: t(
              "settings.licensingAnalytics.usageDescription",
              "Endpoint usage and activity for this server.",
            ),
            icon: "monitoring",
            component: <AdminUsageSection />,
            ...gated,
          },
        ],
      },
      {
        id: "security",
        title: t("settings.securityAuth.security", "Sign-in & security"),
        items: [
          {
            key: "adminSecurity",
            label: t("settings.securityAuth.security", "Sign-in & security"),
            description: t(
              "admin.settings.security.description",
              "How people sign in, how sessions are held, and what this server discloses about itself.",
            ),
            icon: "shield-rounded",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminSecurityPage />
              </Suspense>
            ),
            ...gated,
          },
        ],
      },
      {
        id: "audit",
        title: t("settings.licensingAnalytics.audit", "Audit log"),
        items: [
          {
            key: "adminAudit",
            label: t("settings.licensingAnalytics.audit", "Audit log"),
            description: t(
              "settings.licensingAnalytics.auditDescription",
              "Who did what on this server, and how long that record is kept.",
            ),
            icon: "fact-check-rounded",
            component: <AdminAuditSection />,
            ...gated,
          },
        ],
      },
      {
        id: "integrations",
        title: t("settings.configuration.integrations", "Integrations"),
        items: [
          {
            key: "adminConnections",
            label: t("settings.configuration.integrations", "Integrations"),
            description: t(
              "admin.settings.connections.description",
              "Mail, Telegram, Drive, and uploading from a phone.",
            ),
            icon: "hub-rounded",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminIntegrationsPage />
              </Suspense>
            ),
            ...gated,
          },
        ],
      },
      {
        id: "legal",
        title: t("settings.policiesPrivacy.title", "Legal & privacy"),
        items: [
          {
            key: "adminLegal",
            label: t("settings.policiesPrivacy.title", "Legal & privacy"),
            description: t(
              "admin.settings.legal.description",
              "Configure links to legal documents and policies.",
            ),
            icon: "gavel-rounded",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminLegalPrivacyPage />
              </Suspense>
            ),
            ...gated,
          },
        ],
      },
      {
        id: "ai",
        title: t("settings.ai.title", "AI"),
        items: [
          {
            key: "adminAi",
            label: t("settings.ai.general", "AI Engine"),
            description: t(
              "admin.settings.ai.description",
              "Connect Stirling to the Python AI engine, choose its models, and set the guardrails it runs under.",
            ),
            icon: "smart-toy-rounded",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminAiSection />
              </Suspense>
            ),
            ...gated,
          },
        ],
      },
      // Changed once at install time, if ever: folded so the list stays short.
      {
        id: "advanced",
        title: t("settings.configuration.advanced", "Advanced"),
        items: [
          {
            key: "adminAdvanced",
            label: t("settings.configuration.advanced", "Advanced"),
            description: t(
              "admin.settings.advanced.description",
              "Feature flags, processing limits, temp files and the database. Set once at install, if ever.",
            ),
            icon: "tune-rounded",
            component: (
              <Suspense fallback={<LoadingFallback />}>
                <AdminAdvancedPage />
              </Suspense>
            ),
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
