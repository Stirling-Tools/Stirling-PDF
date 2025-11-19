import React from 'react';
import { NavKey } from '@app/components/shared/config/types';
import HotkeysSection from '@app/components/shared/config/configSections/HotkeysSection';
import GeneralSection from '@app/components/shared/config/configSections/GeneralSection';

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
  _isAdmin: boolean = false,
  _runningEE: boolean = false,
  _loginEnabled: boolean = false
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

  return sections;
};
