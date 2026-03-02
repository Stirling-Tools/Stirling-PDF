import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useConfigNavSections as useProprietaryConfigNavSections, createConfigNavSections as createProprietaryConfigNavSections } from '@proprietary/components/shared/config/configNavSections';
import { ConfigNavSection } from '@core/components/shared/config/configNavSections';
import { ConnectionSettings } from '@app/components/ConnectionSettings';
import { SaasPlanSection } from '@app/components/shared/config/configSections/SaasPlanSection';
import { SaaSTeamsSection } from '@app/components/shared/config/configSections/SaaSTeamsSection';
import { connectionModeService } from '@app/services/connectionModeService';
import { authService } from '@app/services/authService';

/**
 * Hook version of desktop config nav sections with proper i18n support
 */
export const useConfigNavSections = (
  isAdmin: boolean = false,
  runningEE: boolean = false,
  loginEnabled: boolean = false
): ConfigNavSection[] => {
  const { t } = useTranslation();

  // Check if in SaaS mode and authenticated (for Team section visibility)
  const [isSaasMode, setIsSaasMode] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    const checkAccess = async () => {
      const mode = await connectionModeService.getCurrentMode();
      const auth = await authService.isAuthenticated();
      setIsSaasMode(mode === 'saas');
      setIsAuthenticated(auth);
    };

    checkAccess();

    // Subscribe to connection mode changes
    const unsubscribe = connectionModeService.subscribeToModeChanges(checkAccess);
    return unsubscribe;
  }, []);

  // Subscribe to auth changes
  useEffect(() => {
    const unsubscribe = authService.subscribeToAuth((status) => {
      setIsAuthenticated(status === 'authenticated');
    });
    return unsubscribe;
  }, []);

  // Get the proprietary sections (includes core Preferences + admin sections)
  const sections = useProprietaryConfigNavSections(isAdmin, runningEE, loginEnabled);

  // Identifies self-hosted admin sections by their first item's stable key.
  // Using item keys avoids dependency on translated section titles (#17).
  const SELF_HOSTED_SECTION_FIRST_KEYS = new Set([
    'people',        // Workspace section
    'adminGeneral',  // Configuration section
    'adminSecurity', // Security & Authentication section
    'adminPlan',     // Licensing & Analytics section
    'adminLegal',    // Policies & Privacy section
  ]);

  // Build the result array explicitly instead of splice with hardcoded indices (#18).
  const result: ConfigNavSection[] = [];

  // Preferences is always first
  if (sections.length > 0) result.push(sections[0]);

  // Connection Mode always sits immediately after Preferences
  result.push({
    title: t('settings.connection.title', 'Connection Mode'),
    items: [
      {
        key: 'connectionMode',
        label: t('settings.connection.title', 'Connection Mode'),
        icon: 'desktop-cloud-rounded',
        component: <ConnectionSettings />,
      },
    ],
  });

  // Plan & Billing and Team sections only when authenticated in SaaS mode
  if (isSaasMode && isAuthenticated) {
    result.push({
      title: t('settings.planBilling.title', 'Plan & Billing'),
      items: [
        {
          key: 'planBilling',
          label: t('settings.planBilling.title', 'Plan & Billing'),
          icon: 'credit-card',
          component: <SaasPlanSection />,
        },
      ],
    });
    result.push({
      title: t('settings.team.title', 'Team'),
      items: [
        {
          key: 'teams',
          label: t('settings.team.title', 'Team'),
          icon: 'groups-rounded',
          component: <SaaSTeamsSection />,
        },
      ],
    });
  }

  // Append remaining proprietary sections, skipping self-hosted admin sections in SaaS mode
  for (const section of sections.slice(1)) {
    const firstItemKey = section.items[0]?.key;
    if (isSaasMode && firstItemKey && SELF_HOSTED_SECTION_FIRST_KEYS.has(firstItemKey)) {
      continue;
    }
    result.push(section);
  }

  return result;
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
        icon: 'desktop-cloud-rounded',
        component: <ConnectionSettings />,
      },
    ],
  });

  // Add Plan & Billing section (after Connection Mode)
  sections.splice(2, 0, {
    title: 'Plan & Billing',
    items: [
      {
        key: 'planBilling',
        label: 'Plan & Billing',
        icon: 'credit-card',
        component: <SaasPlanSection />,
      },
    ],
  });

  return sections;
};
