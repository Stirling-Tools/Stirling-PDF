import { createConfigNavSections as createProprietaryConfigNavSections } from '@proprietary/components/shared/config/configNavSections';
import { ConfigNavSection } from '@core/components/shared/config/configNavSections';
import { ConnectionSettings } from '@app/components/ConnectionSettings';

/**
 * Desktop extension of createConfigNavSections that adds connection settings
 */
export const createConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  // Get the proprietary sections (includes core Preferences + admin sections)
  const sections = createProprietaryConfigNavSections(isAdmin, runningEE, loginEnabled);

  // Add Connection section at the beginning (after Preferences)
  sections.splice(1, 0, {
    title: 'Connection',
    items: [
      {
        key: 'connectionMode',
        label: 'Connection Mode',
        icon: 'cloud-rounded',
        component: <ConnectionSettings />,
      },
    ],
  });

  return sections;
};
