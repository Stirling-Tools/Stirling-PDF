import React from 'react';
import { NavKey } from './types';
import { AppConfig } from '../../../hooks/useAppConfig';
import HotkeysSection from './configSections/HotkeysSection';

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
  onLogoutClick: () => void
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
          key: 'hotkeys',
          label: 'Keyboard Shortcuts',
          icon: 'keyboard-rounded',
          component: <HotkeysSection />
        },
      ],
    },
  ];

  return sections;
};