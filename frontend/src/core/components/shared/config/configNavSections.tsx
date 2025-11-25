import React from 'react';
import { useTranslation } from 'react-i18next';
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

export const useConfigNavSections = (
  _isAdmin: boolean = false,
  _runningEE: boolean = false,
  _loginEnabled: boolean = false
): ConfigNavSection[] => {
  const { t } = useTranslation();

  const sections: ConfigNavSection[] = [
    {
      title: t('settings.preferences.title', 'Preferences'),
      items: [
        {
          key: 'general',
          label: t('settings.general.title', 'General'),
          icon: 'settings-rounded',
          component: <GeneralSection />
        },
        {
          key: 'hotkeys',
          label: t('settings.hotkeys.title', 'Keyboard Shortcuts'),
          icon: 'keyboard-rounded',
          component: <HotkeysSection />
        },
      ],
    },
  ];

  return sections;
};

// Deprecated: Use useConfigNavSections hook instead
export const createConfigNavSections = (
  _isAdmin: boolean = false,
  _runningEE: boolean = false,
  _loginEnabled: boolean = false
): ConfigNavSection[] => {
  console.warn('createConfigNavSections is deprecated. Use useConfigNavSections hook instead for proper i18n support.');
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
