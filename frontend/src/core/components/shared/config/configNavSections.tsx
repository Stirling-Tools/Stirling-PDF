import React from 'react';
import { NavKey } from '@app/components/shared/config/types';
import HotkeysSection from '@app/components/shared/config/configSections/HotkeysSection';
import GeneralSection from '@app/components/shared/config/configSections/GeneralSection';
import AdminGeneralSection from '@app/components/shared/config/configSections/AdminGeneralSection';
import AdminSecuritySection from '@app/components/shared/config/configSections/AdminSecuritySection';
import AdminConnectionsSection from '@app/components/shared/config/configSections/AdminConnectionsSection';
import AdminPrivacySection from '@app/components/shared/config/configSections/AdminPrivacySection';
import AdminDatabaseSection from '@app/components/shared/config/configSections/AdminDatabaseSection';
import AdminAdvancedSection from '@app/components/shared/config/configSections/AdminAdvancedSection';
import AdminLegalSection from '@app/components/shared/config/configSections/AdminLegalSection';
import AdminPremiumSection from '@app/components/shared/config/configSections/AdminPremiumSection';
import AdminFeaturesSection from '@app/components/shared/config/configSections/AdminFeaturesSection';
import AdminEndpointsSection from '@app/components/shared/config/configSections/AdminEndpointsSection';
import AdminPlanSection from '@app/components/shared/config/configSections/AdminPlanSection';
import AdminAuditSection from '@app/components/shared/config/configSections/AdminAuditSection';
import AdminUsageSection from '@app/components/shared/config/configSections/AdminUsageSection';

export interface ConfigNavItem {
  key: NavKey;
  label: string;
  icon: string;
  component: React.ReactNode;
  disabled?: boolean;
  disabledTooltip?: string;
}

export interface ConfigNavSection {
  title: string;
  items: ConfigNavItem[];
}

export interface ConfigColors {
  navBg: string;
  sectionTitle: string;
  navItem: string;
  navItemActive: string;
  navItemActiveBg: string;
  contentBg: string;
  headerBorder: string;
}

export const createConfigNavSections = (
  Overview: React.ComponentType<{ onLogoutClick: () => void }>,
  onLogoutClick: () => void,
  isAdmin: boolean = false,
  runningEE: boolean = false
): ConfigNavSection[] => {
  const sections: ConfigNavSection[] = [
    {
      title: 'Preferences',
      items: [
        {
          key: 'general',
          label: 'General',
          icon: 'settings-rounded',
          component: <GeneralSection />
        },
        {
          key: 'hotkeys',
          label: 'Keyboard Shortcuts',
          icon: 'keyboard-rounded',
          component: <HotkeysSection />
        },
      ],
    },
  ];

  // Add Admin sections if user is admin
  if (isAdmin) {
    // Configuration
    sections.push({
      title: 'Configuration',
      items: [
        {
          key: 'adminGeneral',
          label: 'System Settings',
          icon: 'settings-rounded',
          component: <AdminGeneralSection />
        },
        {
          key: 'adminFeatures',
          label: 'Features',
          icon: 'extension-rounded',
          component: <AdminFeaturesSection />
        },
        {
          key: 'adminEndpoints',
          label: 'Endpoints',
          icon: 'api-rounded',
          component: <AdminEndpointsSection />
        },
        {
          key: 'adminDatabase',
          label: 'Database',
          icon: 'storage-rounded',
          component: <AdminDatabaseSection />
        },
        {
          key: 'adminAdvanced',
          label: 'Advanced',
          icon: 'tune-rounded',
          component: <AdminAdvancedSection />
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
          component: <AdminSecuritySection />
        },
        {
          key: 'adminConnections',
          label: 'Connections',
          icon: 'link-rounded',
          component: <AdminConnectionsSection />
        },
      ],
    });

    // Licensing & Analytics
    sections.push({
      title: 'Licensing & Analytics',
      items: [
        {
          key: 'adminPremium',
          label: 'Premium',
          icon: 'star-rounded',
          component: <AdminPremiumSection />
        },
        {
          key: 'adminPlan',
          label: 'Plan',
          icon: 'receipt-long-rounded',
          component: <AdminPlanSection />
        },
        {
          key: 'adminAudit',
          label: 'Audit',
          icon: 'fact-check-rounded',
          component: <AdminAuditSection />,
          disabled: !runningEE,
          disabledTooltip: 'Requires Enterprise license'
        },
        {
          key: 'adminUsage',
          label: 'Usage Analytics',
          icon: 'analytics-rounded',
          component: <AdminUsageSection />,
          disabled: !runningEE,
          disabledTooltip: 'Requires Enterprise license'
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
          component: <AdminLegalSection />
        },
        {
          key: 'adminPrivacy',
          label: 'Privacy',
          icon: 'visibility-rounded',
          component: <AdminPrivacySection />
        },
      ],
    });
  }

  return sections;
};
