import type { StepType } from '@reactour/tour';
import type { TFunction } from 'i18next';
import { AdminTourStep } from './tourSteps';
import { addGlowToElements, removeAllGlows } from './tourGlow';

interface AdminStepActions {
  saveAdminState: () => void;
  openConfigModal: () => void;
  navigateToSection: (section: string) => void;
  scrollNavToSection: (section: string) => Promise<void> | void;
}

interface CreateAdminStepsConfigArgs {
  t: TFunction;
  actions: AdminStepActions;
}

export function createAdminStepsConfig({ t, actions }: CreateAdminStepsConfigArgs): Record<AdminTourStep, StepType> {
  const { saveAdminState, openConfigModal, navigateToSection, scrollNavToSection } = actions;

  return {
    [AdminTourStep.WELCOME]: {
      selector: '[data-tour="config-button"]',
      content: t('adminOnboarding.welcome', "Welcome to the <strong>Admin Tour</strong>! Let's explore the powerful enterprise features and settings available to system administrators."),
      position: 'right',
      padding: 10,
      action: () => {
        saveAdminState();
      },
    },
    [AdminTourStep.CONFIG_BUTTON]: {
      selector: '[data-tour="config-button"]',
      content: t('adminOnboarding.configButton', "Click the <strong>Config</strong> button to access all system settings and administrative controls."),
      position: 'right',
      padding: 10,
      actionAfter: () => {
        openConfigModal();
      },
    },
    [AdminTourStep.SETTINGS_OVERVIEW]: {
      selector: '.modal-nav',
      content: t('adminOnboarding.settingsOverview', "This is the <strong>Settings Panel</strong>. Admin settings are organised by category for easy navigation."),
      position: 'right',
      padding: 0,
      action: () => {
        removeAllGlows();
      },
    },
    [AdminTourStep.TEAMS_AND_USERS]: {
      selector: '[data-tour="admin-people-nav"]',
      highlightedSelectors: ['[data-tour="admin-people-nav"]', '[data-tour="admin-teams-nav"]', '[data-tour="settings-content-area"]'],
      content: t('adminOnboarding.teamsAndUsers', "Manage <strong>Teams</strong> and individual users here. You can invite new users via email, shareable links, or create custom accounts for them yourself."),
      position: 'right',
      padding: 10,
      action: () => {
        removeAllGlows();
        navigateToSection('people');
        setTimeout(() => {
          addGlowToElements(['[data-tour="admin-people-nav"]', '[data-tour="admin-teams-nav"]', '[data-tour="settings-content-area"]']);
        }, 100);
      },
    },
    [AdminTourStep.SYSTEM_CUSTOMIZATION]: {
      selector: '[data-tour="admin-adminGeneral-nav"]',
      highlightedSelectors: ['[data-tour="admin-adminGeneral-nav"]', '[data-tour="admin-adminFeatures-nav"]', '[data-tour="admin-adminEndpoints-nav"]', '[data-tour="settings-content-area"]'],
      content: t('adminOnboarding.systemCustomization', "We have extensive ways to customise the UI: <strong>System Settings</strong> let you change the app name and languages, <strong>Features</strong> allows server certificate management, and <strong>Endpoints</strong> lets you enable or disable specific tools for your users."),
      position: 'right',
      padding: 10,
      action: () => {
        removeAllGlows();
        navigateToSection('adminGeneral');
        setTimeout(() => {
          addGlowToElements(['[data-tour="admin-adminGeneral-nav"]', '[data-tour="admin-adminFeatures-nav"]', '[data-tour="admin-adminEndpoints-nav"]', '[data-tour="settings-content-area"]']);
        }, 100);
      },
    },
    [AdminTourStep.DATABASE_SECTION]: {
      selector: '[data-tour="admin-adminDatabase-nav"]',
      highlightedSelectors: ['[data-tour="admin-adminDatabase-nav"]', '[data-tour="settings-content-area"]'],
      content: t('adminOnboarding.databaseSection', "For advanced production environments, we have settings to allow <strong>external database hookups</strong> so you can integrate with your existing infrastructure."),
      position: 'right',
      padding: 10,
      action: () => {
        removeAllGlows();
        navigateToSection('adminDatabase');
        setTimeout(() => {
          addGlowToElements(['[data-tour="admin-adminDatabase-nav"]', '[data-tour="settings-content-area"]']);
        }, 100);
      },
    },
    [AdminTourStep.CONNECTIONS_SECTION]: {
      selector: '[data-tour="admin-adminConnections-nav"]',
      highlightedSelectors: ['[data-tour="admin-adminConnections-nav"]', '[data-tour="settings-content-area"]'],
      content: t('adminOnboarding.connectionsSection', "The <strong>Connections</strong> section supports various login methods including custom SSO and SAML providers like Google and GitHub, plus email integrations for notifications and communications."),
      position: 'right',
      padding: 10,
      action: () => {
        removeAllGlows();
        navigateToSection('adminConnections');
        setTimeout(() => {
          addGlowToElements(['[data-tour="admin-adminConnections-nav"]', '[data-tour="settings-content-area"]']);
        }, 100);
      },
      actionAfter: async () => {
        await scrollNavToSection('adminAudit');
      },
    },
    [AdminTourStep.ADMIN_TOOLS]: {
      selector: '[data-tour="admin-adminAudit-nav"]',
      highlightedSelectors: ['[data-tour="admin-adminAudit-nav"]', '[data-tour="admin-adminUsage-nav"]', '[data-tour="settings-content-area"]'],
      content: t('adminOnboarding.adminTools', "Finally, we have advanced administration tools like <strong>Auditing</strong> to track system activity and <strong>Usage Analytics</strong> to monitor how your users interact with the platform."),
      position: 'right',
      padding: 10,
      action: () => {
        removeAllGlows();
        navigateToSection('adminAudit');
        setTimeout(() => {
          addGlowToElements(['[data-tour="admin-adminAudit-nav"]', '[data-tour="admin-adminUsage-nav"]', '[data-tour="settings-content-area"]']);
        }, 100);
      },
    },
    [AdminTourStep.WRAP_UP]: {
      selector: '[data-tour="help-button"]',
      content: t('adminOnboarding.wrapUp', "That's the admin tour! You've seen the enterprise features that make Stirling PDF a powerful, customisable solution for organisations. Access this tour anytime from the <strong>Help</strong> menu."),
      position: 'right',
      padding: 10,
      action: () => {
        removeAllGlows();
      },
    },
  };
}

