import React from 'react';
import { createConfigNavSections as createCoreConfigNavSections, ConfigNavSection } from '@core/components/shared/config/configNavSections';
import PeopleSection from '@app/components/shared/config/configSections/PeopleSection';
import TeamsSection from '@app/components/shared/config/configSections/TeamsSection';
import AdminGeneralSection from '@app/components/shared/config/configSections/AdminGeneralSection';
import AdminSecuritySection from '@app/components/shared/config/configSections/AdminSecuritySection';
import AdminConnectionsSection from '@app/components/shared/config/configSections/AdminConnectionsSection';
import AdminPrivacySection from '@app/components/shared/config/configSections/AdminPrivacySection';
import AdminDatabaseSection from '@app/components/shared/config/configSections/AdminDatabaseSection';
import AdminAdvancedSection from '@app/components/shared/config/configSections/AdminAdvancedSection';
import AdminLegalSection from '@app/components/shared/config/configSections/AdminLegalSection';
import AdminPlanSection from '@app/components/shared/config/configSections/AdminPlanSection';
import AdminFeaturesSection from '@app/components/shared/config/configSections/AdminFeaturesSection';
import AdminEndpointsSection from '@app/components/shared/config/configSections/AdminEndpointsSection';
import AdminAuditSection from '@app/components/shared/config/configSections/AdminAuditSection';
import AdminUsageSection from '@app/components/shared/config/configSections/AdminUsageSection';
import ApiKeys from '@app/components/shared/config/configSections/ApiKeys';

/**
 * Proprietary extension of createConfigNavSections that adds all admin and workspace sections
 */
export const createConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  // Get the core sections (just Preferences)
  const sections = createCoreConfigNavSections(isAdmin, runningEE, loginEnabled);

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
