import React from 'react';
import { createConfigNavSections as createCoreConfigNavSections, ConfigNavSection } from '@core/components/shared/config/configNavSections';
import PeopleSection from '@app/components/shared/config/configSections/PeopleSection';
import TeamsSection from '@app/components/shared/config/configSections/TeamsSection';
import ApiKeys from '@app/components/shared/config/configSections/ApiKeys';

/**
 * Proprietary extension of createConfigNavSections that adds workspace sections
 */
export const createConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  // Get the core sections
  const sections = createCoreConfigNavSections(isAdmin, runningEE);

  // Add Workspace section if user is admin
  if (isAdmin) {
    const workspaceSection: ConfigNavSection = {
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
    };

    // Insert workspace section after Preferences (at index 1)
    sections.splice(1, 0, workspaceSection);
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
