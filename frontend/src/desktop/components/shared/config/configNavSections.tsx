import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useConfigNavSections as useProprietaryConfigNavSections, createConfigNavSections as createProprietaryConfigNavSections } from '@proprietary/components/shared/config/configNavSections';
import { ConfigNavSection } from '@core/components/shared/config/configNavSections';
import { ConnectionSettings } from '@app/components/ConnectionSettings';
import { DesktopPlanSection } from '@app/components/shared/config/configSections/DesktopPlanSection';
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
  let sections = useProprietaryConfigNavSections(isAdmin, runningEE, loginEnabled);

  // Hide self-hosted admin sections when in SaaS mode
  if (isSaasMode) {
    // Keep only: Preferences, Developer (if exists)
    // Remove: Workspace, Configuration, Security & Auth, Licensing & Analytics, Policies & Privacy
    const selfHostedSectionTitles = [
      'Workspace',
      'Configuration',
      'Security & Authentication',
      'Licensing & Analytics',
      'Policies & Privacy',
      // Translated versions
      t('settings.workspace.title', 'Workspace'),
      t('settings.configuration.title', 'Configuration'),
      t('settings.securityAuth.title', 'Security & Authentication'),
      t('settings.licensingAnalytics.title', 'Licensing & Analytics'),
      t('settings.policiesPrivacy.title', 'Policies & Privacy'),
    ];

    sections = sections.filter(section => !selfHostedSectionTitles.includes(section.title));
  }

  // Add Connection section at the beginning (after Preferences)
  sections.splice(1, 0, {
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

  // Add Plan & Billing section (after Connection Mode)
  sections.splice(2, 0, {
    title: t('settings.planBilling.title', 'Plan & Billing'),
    items: [
      {
        key: 'planBilling',
        label: t('settings.planBilling.title', 'Plan & Billing'),
        icon: 'credit-card',
        component: <DesktopPlanSection />,
      },
    ],
  });

  // Add Team Management section for SaaS users (only when logged into SaaS)
  if (isSaasMode && isAuthenticated) {
    sections.splice(3, 0, {
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
        component: <DesktopPlanSection />,
      },
    ],
  });

  return sections;
};
