import React from 'react';
import { NavKey } from './types';
import HotkeysSection from './configSections/HotkeysSection';
import GeneralSection from './configSections/GeneralSection';
import PeopleSection from './configSections/PeopleSection';
import TeamsSection from './configSections/TeamsSection';
import AdminGeneralSection from './configSections/AdminGeneralSection';
import AdminSecuritySection from './configSections/AdminSecuritySection';
import AdminConnectionsSection from './configSections/AdminConnectionsSection';
import AdminPrivacySection from './configSections/AdminPrivacySection';
import AdminDatabaseSection from './configSections/AdminDatabaseSection';
import AdminAdvancedSection from './configSections/AdminAdvancedSection';
import AdminLegalSection from './configSections/AdminLegalSection';
import AdminPremiumSection from './configSections/AdminPremiumSection';
import AdminFeaturesSection from './configSections/AdminFeaturesSection';
import AdminEndpointsSection from './configSections/AdminEndpointsSection';

export interface ConfigNavItem {
  key: NavKey;
  label: string;
  icon: string;
  component: React.ReactNode;
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
  isAdmin: boolean = false
): ConfigNavSection[] => {
  const sections: ConfigNavSection[] = [
    {
      title: 'Account',
      items: [
        {
          key: 'overview',
          label: 'Overview',
          icon: 'person-rounded',
          component: <Overview onLogoutClick={onLogoutClick} />
        },
      ],
    },
    {
      title: 'Workspace',
      items: [
        {
          key: 'people',
          label: 'People',
          icon: 'group-rounded',
          component: <PeopleSection />
        },
        {
          key: 'teams',
          label: 'Teams',
          icon: 'groups-rounded',
          component: <TeamsSection />
        },
      ],
    },
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

  // Add Admin Settings section if user is admin
  if (isAdmin) {
    sections.push({
      title: 'Admin Settings',
      items: [
        {
          key: 'adminGeneral',
          label: 'General',
          icon: 'settings-rounded',
          component: <AdminGeneralSection />
        },
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
        {
          key: 'adminDatabase',
          label: 'Database',
          icon: 'storage-rounded',
          component: <AdminDatabaseSection />
        },
        {
          key: 'adminPremium',
          label: 'Premium',
          icon: 'star-rounded',
          component: <AdminPremiumSection />
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
          key: 'adminAdvanced',
          label: 'Advanced',
          icon: 'tune-rounded',
          component: <AdminAdvancedSection />
        },
      ],
    });
  }

  return sections;
};
