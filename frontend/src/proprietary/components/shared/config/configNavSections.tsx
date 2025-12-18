import React, { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigNavSections as useCoreConfigNavSections, createConfigNavSections as createCoreConfigNavSections, ConfigNavSection } from '@core/components/shared/config/configNavSections';

// Lazy load all config sections
const PeopleSection = lazy(() => import('@app/components/shared/config/configSections/PeopleSection'));
const TeamsSection = lazy(() => import('@app/components/shared/config/configSections/TeamsSection'));
const AdminGeneralSection = lazy(() => import('@app/components/shared/config/configSections/AdminGeneralSection'));
const AdminSecuritySection = lazy(() => import('@app/components/shared/config/configSections/AdminSecuritySection'));
const AdminConnectionsSection = lazy(() => import('@app/components/shared/config/configSections/AdminConnectionsSection'));
const AdminPrivacySection = lazy(() => import('@app/components/shared/config/configSections/AdminPrivacySection'));
const AdminDatabaseSection = lazy(() => import('@app/components/shared/config/configSections/AdminDatabaseSection'));
const AdminAdvancedSection = lazy(() => import('@app/components/shared/config/configSections/AdminAdvancedSection'));
const AdminLegalSection = lazy(() => import('@app/components/shared/config/configSections/AdminLegalSection'));
const AdminPlanSection = lazy(() => import('@app/components/shared/config/configSections/AdminPlanSection'));
const AdminFeaturesSection = lazy(() => import('@app/components/shared/config/configSections/AdminFeaturesSection'));
const AdminEndpointsSection = lazy(() => import('@app/components/shared/config/configSections/AdminEndpointsSection'));
const AdminAuditSection = lazy(() => import('@app/components/shared/config/configSections/AdminAuditSection'));
const AdminUsageSection = lazy(() => import('@app/components/shared/config/configSections/AdminUsageSection'));
const ApiKeys = lazy(() => import('@app/components/shared/config/configSections/ApiKeys'));
const AccountSection = lazy(() => import('@app/components/shared/config/configSections/AccountSection'));
const GeneralSection = lazy(() => import('@app/components/shared/config/configSections/GeneralSection'));

/**
 * Hook version of proprietary config nav sections with proper i18n support
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  const { t } = useTranslation();

  // Get the core sections (just Preferences)
  const sections = useCoreConfigNavSections(isAdmin, runningEE, loginEnabled);

  // Add account management under Preferences
  const preferencesSection = sections.find((section) => section.items.some((item) => item.key === 'general'));
  if (preferencesSection) {
    preferencesSection.items = preferencesSection.items.map((item) =>
      item.key === 'general' ? { ...item, component: <GeneralSection /> } : item
    );

    if (loginEnabled) {
      preferencesSection.items.push({
        key: 'account',
        label: t('account.accountSettings', 'Account'),
        icon: 'person-rounded',
        component: <AccountSection />
      });
    }
  }

  // Add Admin sections if user is admin OR if login is disabled (but mark as disabled)
  if (isAdmin || !loginEnabled) {
    const requiresLogin = !loginEnabled;
    const enableLoginTooltip = t('settings.tooltips.enableLoginFirst', 'Enable login mode first');
    const requiresEnterpriseTooltip = t('settings.tooltips.requiresEnterprise', 'Requires Enterprise license');

    // Workspace
    sections.push({
      title: t('settings.workspace.title', 'Workspace'),
      items: [
        {
          key: 'people',
          label: t('settings.workspace.people', 'People'),
          icon: 'group-rounded',
          component: <PeopleSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'teams',
          label: t('settings.workspace.teams', 'Teams'),
          icon: 'groups-rounded',
          component: <TeamsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
      ],
    });

    // Configuration
    sections.push({
      title: t('settings.configuration.title', 'Configuration'),
      items: [
        {
          key: 'adminGeneral',
          label: t('settings.configuration.systemSettings', 'System Settings'),
          icon: 'settings-rounded',
          component: <AdminGeneralSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'adminFeatures',
          label: t('settings.configuration.features', 'Features'),
          icon: 'extension-rounded',
          component: <AdminFeaturesSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'adminEndpoints',
          label: t('settings.configuration.endpoints', 'Endpoints'),
          icon: 'api-rounded',
          component: <AdminEndpointsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'adminDatabase',
          label: t('settings.configuration.database', 'Database'),
          icon: 'storage-rounded',
          component: <AdminDatabaseSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'adminAdvanced',
          label: t('settings.configuration.advanced', 'Advanced'),
          icon: 'tune-rounded',
          component: <AdminAdvancedSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
      ],
    });

    // Security & Authentication
    sections.push({
      title: t('settings.securityAuth.title', 'Security & Authentication'),
      items: [
        {
          key: 'adminSecurity',
          label: t('settings.securityAuth.security', 'Security'),
          icon: 'shield-rounded',
          component: <AdminSecuritySection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'adminConnections',
          label: t('settings.securityAuth.connections', 'Connections'),
          icon: 'link-rounded',
          component: <AdminConnectionsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
      ],
    });

    // Licensing & Analytics
    sections.push({
      title: t('settings.licensingAnalytics.title', 'Licensing & Analytics'),
      items: [
        {
          key: 'adminPlan',
          label: t('settings.licensingAnalytics.plan', 'Plan'),
          icon: 'star-rounded',
          component: <AdminPlanSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'adminAudit',
          label: t('settings.licensingAnalytics.audit', 'Audit'),
          icon: 'fact-check-rounded',
          component: <AdminAuditSection />,
          disabled: !runningEE || requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : requiresEnterpriseTooltip
        },
        {
          key: 'adminUsage',
          label: t('settings.licensingAnalytics.usageAnalytics', 'Usage Analytics'),
          icon: 'analytics-rounded',
          component: <AdminUsageSection />,
          disabled: !runningEE || requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : requiresEnterpriseTooltip
        },
      ],
    });

    // Policies & Privacy
    sections.push({
      title: t('settings.policiesPrivacy.title', 'Policies & Privacy'),
      items: [
        {
          key: 'adminLegal',
          label: t('settings.policiesPrivacy.legal', 'Legal'),
          icon: 'gavel-rounded',
          component: <AdminLegalSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
        {
          key: 'adminPrivacy',
          label: t('settings.policiesPrivacy.privacy', 'Privacy'),
          icon: 'visibility-rounded',
          component: <AdminPrivacySection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? enableLoginTooltip : undefined
        },
      ],
    });
  }

  // Add Developer section if login is enabled
  if (loginEnabled) {
    const developerSection: ConfigNavSection = {
      title: t('settings.developer.title', 'Developer'),
      items: [
        {
          key: 'api-keys',
          label: t('settings.developer.apiKeys', 'API Keys'),
          icon: 'key-rounded',
          component: <ApiKeys />
        },
      ],
    };

    // Add Developer section after Preferences (or Workspace if it exists)
    const insertIndex = isAdmin ? 2 : 1;
    sections.splice(insertIndex, 0, developerSection);
  }

  return sections;
};

/**
 * Deprecated: Use useConfigNavSections hook instead
 * Proprietary extension of createConfigNavSections that adds all admin and workspace sections
 */
export const createConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  console.warn('createConfigNavSections is deprecated. Use useConfigNavSections hook instead for proper i18n support.');

  // Get the core sections (just Preferences)
  const sections = createCoreConfigNavSections(isAdmin, runningEE, loginEnabled);

  // Add account management under Preferences
  const preferencesSection = sections.find((section) => section.items.some((item) => item.key === 'general'));
  if (preferencesSection) {
    preferencesSection.items = preferencesSection.items.map((item) =>
      item.key === 'general' ? { ...item, component: <GeneralSection /> } : item
    );

    if (loginEnabled) {
      preferencesSection.items.push({
        key: 'account',
        label: 'Account',
        icon: 'person-rounded',
        component: <AccountSection />
      });
    }
  }

  // Add Admin sections if user is admin OR if login is disabled (but mark as disabled)
  if (isAdmin || !loginEnabled) {
    const requiresLogin = !loginEnabled;

    // Workspace
    sections.push({
      title: 'Workspace',
      items: [
        {
          key: 'people',
          label: 'People',
          icon: 'group-rounded',
          component: <PeopleSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'teams',
          label: 'Teams',
          icon: 'groups-rounded',
          component: <TeamsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
      ],
    });

    // Configuration
    sections.push({
      title: 'Configuration',
      items: [
        {
          key: 'adminGeneral',
          label: 'System Settings',
          icon: 'settings-rounded',
          component: <AdminGeneralSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'adminFeatures',
          label: 'Features',
          icon: 'extension-rounded',
          component: <AdminFeaturesSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'adminEndpoints',
          label: 'Endpoints',
          icon: 'api-rounded',
          component: <AdminEndpointsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'adminDatabase',
          label: 'Database',
          icon: 'storage-rounded',
          component: <AdminDatabaseSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'adminAdvanced',
          label: 'Advanced',
          icon: 'tune-rounded',
          component: <AdminAdvancedSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
      ],
    });

    // Security & Authentication
    sections.push({
      title: 'Security & Authentication',
      items: [
        {
          key: 'adminSecurity',
          label: 'Security',
          icon: 'shield-rounded',
          component: <AdminSecuritySection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'adminConnections',
          label: 'Connections',
          icon: 'link-rounded',
          component: <AdminConnectionsSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
      ],
    });

    // Licensing & Analytics
    sections.push({
      title: 'Licensing & Analytics',
      items: [
        {
          key: 'adminPlan',
          label: 'Plan',
          icon: 'star-rounded',
          component: <AdminPlanSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'adminAudit',
          label: 'Audit',
          icon: 'fact-check-rounded',
          component: <AdminAuditSection />,
          disabled: !runningEE || requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : 'Requires Enterprise license'
        },
        {
          key: 'adminUsage',
          label: 'Usage Analytics',
          icon: 'analytics-rounded',
          component: <AdminUsageSection />,
          disabled: !runningEE || requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : 'Requires Enterprise license'
        },
      ],
    });

    // Policies & Privacy
    sections.push({
      title: 'Policies & Privacy',
      items: [
        {
          key: 'adminLegal',
          label: 'Legal',
          icon: 'gavel-rounded',
          component: <AdminLegalSection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
        {
          key: 'adminPrivacy',
          label: 'Privacy',
          icon: 'visibility-rounded',
          component: <AdminPrivacySection />,
          disabled: requiresLogin,
          disabledTooltip: requiresLogin ? 'Enable login mode first' : undefined
        },
      ],
    });
  }

  // Add Developer section if login is enabled
  if (loginEnabled) {
    const developerSection: ConfigNavSection = {
      title: 'Developer',
      items: [
        {
          key: 'api-keys',
          label: 'API Keys',
          icon: 'key-rounded',
          component: <ApiKeys />
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
export type { ConfigNavSection, ConfigNavItem, ConfigColors } from '@core/components/shared/config/configNavSections';
