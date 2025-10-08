import React from 'react';
import { NavKey } from './types';
import HotkeysSection from './configSections/HotkeysSection';
import GeneralSection from './configSections/GeneralSection';
import HelpSection from './configSections/HelpSection';

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
  onModalClose?: () => void,
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
    {
      title: 'Help',
      items: [
        {
          key: 'help',
          label: 'Help & Support',
          icon: 'help-rounded',
          component: <HelpSection onClose={onModalClose} />
        },
      ],
    },
  ];

  return sections;
};
