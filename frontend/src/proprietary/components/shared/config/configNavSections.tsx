import React from 'react';
import { createConfigNavSections as createCoreConfigNavSections, ConfigNavSection } from '@core/components/shared/config/configNavSections';
import PeopleSection from '@app/components/shared/config/configSections/PeopleSection';
import TeamsSection from '@app/components/shared/config/configSections/TeamsSection';

/**
 * Proprietary extension of createConfigNavSections that adds workspace sections
 */
export const createConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false
): ConfigNavSection[] => {
  // Get the core sections
  const sections = createCoreConfigNavSections(isAdmin, runningEE);

  // Add Workspace section after Preferences (index 1)
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

  return sections;
};

// Re-export types for convenience
export type { ConfigNavSection, ConfigNavItem, ConfigColors } from '@core/components/shared/config/configNavSections';
