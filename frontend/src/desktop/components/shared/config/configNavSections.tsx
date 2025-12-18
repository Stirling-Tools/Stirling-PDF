import { useTranslation } from 'react-i18next';
import { useConfigNavSections as useProprietaryConfigNavSections, createConfigNavSections as createProprietaryConfigNavSections } from '@proprietary/components/shared/config/configNavSections';
import { ConfigNavSection } from '@core/components/shared/config/configNavSections';
import { ConnectionSettings } from '@app/components/ConnectionSettings';

/**
 * Hook version of desktop config nav sections with proper i18n support
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  const { t } = useTranslation();

  // Get the proprietary sections (includes core Preferences + admin sections)
  const sections = useProprietaryConfigNavSections(isAdmin, runningEE, loginEnabled);

  // Add Connection section at the beginning (after Preferences)
  sections.splice(1, 0, {
    title: t('settings.connection.title', 'Connection Mode'),
    items: [
      {
        key: 'connectionMode',
        label: t('settings.connection.title', 'Connection Mode'),
        icon: 'cloud',
        component: <ConnectionSettings />,
      },
    ],
  });

  return sections;
};

/**
 * Deprecated: Use useConfigNavSections hook instead
 * Desktop extension of createConfigNavSections that adds connection settings
 */
export const createConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  console.warn('createConfigNavSections is deprecated. Use useConfigNavSections hook instead for proper i18n support.');

  // Get the proprietary sections (includes core Preferences + admin sections)
  const sections = createProprietaryConfigNavSections(isAdmin, runningEE, loginEnabled);

  // Add Connection section at the beginning (after Preferences)
  sections.splice(1, 0, {
    title: 'Connection',
    items: [
      {
        key: 'connectionMode',
        label: 'Connection Mode',
        icon: 'cloud',
        component: <ConnectionSettings />,
      },
    ],
  });

  return sections;
};
