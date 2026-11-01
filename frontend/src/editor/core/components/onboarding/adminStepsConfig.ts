import type { StepType } from "@reactour/tour";
import type { TFunction } from "i18next";
import {
  besideCentered,
  waitForElement,
  waitForHighlightable,
} from "@editor/components/onboarding/tourUtils";

export enum AdminTourStep {
  WELCOME,
  CONFIG_BUTTON,
  SETTINGS_OVERVIEW,
  TEAMS_AND_USERS,
  SYSTEM_CUSTOMIZATION,
  DATABASE_SECTION,
  CONNECTIONS_SECTION,
  ADMIN_TOOLS,
  WRAP_UP,
}

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

/**
 * Declarative spec for an admin tour step. Most steps open a settings section
 * and point at its nav row, so that is expressed as data (`section`) and the
 * runner below turns it into the reactour enter/after hooks.
 */
interface AdminStepSpec {
  step: AdminTourStep;
  selector: string;
  contentKey: string;
  contentDefault: string;
  position?: StepType["position"];
  padding?: number;
  highlightedSelectors?: string[];
  /** Navigate to this settings section on enter. */
  section?: string;
  /** Save admin/workbench state on enter (first step). */
  saveStateOnEnter?: boolean;
  /** Open the config modal after this step (config-button step). */
  openConfigAfter?: boolean;
  /** Scroll the settings nav to this section after this step. */
  scrollToAfter?: string;
  /** Wait for the step's own selector to be present + highlightable on enter. */
  waitForSelectorOnEnter?: boolean;
}

// Nav rows sit flush in a narrow rail; a wider ring overlaps their neighbours.
const NAV_PADDING = 4;

const ADMIN_STEP_SPECS: AdminStepSpec[] = [
  {
    step: AdminTourStep.WELCOME,
    selector: '[data-tour="config-button"]',
    contentKey: "adminOnboarding.welcome",
    contentDefault:
      "Welcome to the <strong>Admin Tour</strong>! Let's explore the powerful enterprise features and settings available to system administrators.",
    padding: NAV_PADDING,
    saveStateOnEnter: true,
  },
  {
    step: AdminTourStep.CONFIG_BUTTON,
    selector: '[data-tour="config-button"]',
    contentKey: "adminOnboarding.configButton",
    contentDefault:
      "Open <strong>Settings</strong> to access all system configuration and administrative controls.",
    padding: NAV_PADDING,
    openConfigAfter: true,
  },
  {
    step: AdminTourStep.SETTINGS_OVERVIEW,
    selector: ".modal-nav",
    contentKey: "adminOnboarding.settingsOverview",
    contentDefault:
      "This is the <strong>Settings Panel</strong>. Admin settings are organised by category for easy navigation.",
    padding: 0,
  },
  {
    step: AdminTourStep.TEAMS_AND_USERS,
    selector: '[data-tour="admin-users-nav"]',
    contentKey: "adminOnboarding.teamsAndUsers",
    contentDefault:
      "Manage <strong>Teams</strong> and individual users here. You can invite new users via email, shareable links, or create custom accounts for them yourself.",
    padding: NAV_PADDING,
    section: "users",
  },
  {
    step: AdminTourStep.SYSTEM_CUSTOMIZATION,
    selector: '[data-tour="admin-adminGeneral-nav"]',
    contentKey: "adminOnboarding.systemCustomization",
    contentDefault:
      "We have extensive ways to customise the UI: <strong>System Settings</strong> let you change the app name and languages, <strong>Features</strong> allows server certificate management, and <strong>Endpoints</strong> lets you enable or disable specific tools for your users.",
    padding: NAV_PADDING,
    section: "adminGeneral",
  },
  {
    step: AdminTourStep.DATABASE_SECTION,
    selector: '[data-tour="admin-adminDatabase-nav"]',
    contentKey: "adminOnboarding.databaseSection",
    contentDefault:
      "For advanced production environments, we have settings to allow <strong>external database hookups</strong> so you can integrate with your existing infrastructure.",
    padding: NAV_PADDING,
    section: "adminDatabase",
  },
  {
    step: AdminTourStep.CONNECTIONS_SECTION,
    selector: '[data-tour="admin-adminSecurity-nav"]',
    contentKey: "adminOnboarding.connectionsSection",
    contentDefault:
      "The <strong>Connections</strong> section supports various login methods including custom SSO and SAML providers like Google and GitHub, plus email integrations for notifications and communications.",
    padding: NAV_PADDING,
    section: "adminSecurity",
    scrollToAfter: "adminAudit",
  },
  {
    step: AdminTourStep.ADMIN_TOOLS,
    selector: '[data-tour="admin-adminAudit-nav"]',
    contentKey: "adminOnboarding.adminTools",
    contentDefault:
      "Finally, we have advanced administration tools like <strong>Auditing</strong> to track system activity and <strong>Usage Analytics</strong> to monitor how your users interact with the platform.",
    padding: NAV_PADDING,
    section: "adminAudit",
    highlightedSelectors: [
      '[data-tour="admin-adminAudit-nav"]',
      '[data-tour="admin-adminUsage-nav"]',
    ],
  },
  {
    step: AdminTourStep.WRAP_UP,
    selector: '[data-tour="admin-about-nav"]',
    contentKey: "adminOnboarding.wrapUp",
    contentDefault:
      "That's the admin tour! You've seen the enterprise features that make Stirling PDF a powerful, customisable solution for organisations. You can replay it anytime — just open <strong>Settings</strong> and find it here under <strong>About</strong>.",
    padding: NAV_PADDING,
    section: "about",
    waitForSelectorOnEnter: true,
  },
];

export function createAdminStepsConfig({
  t,
  actions,
}: CreateAdminStepsConfigArgs): Record<AdminTourStep, StepType> {
  const {
    saveAdminState,
    openConfigModal,
    navigateToSection,
    scrollNavToSection,
  } = actions;

  const build = (spec: AdminStepSpec): StepType => {
    const step: StepType = {
      selector: spec.selector,
      content: t(spec.contentKey, spec.contentDefault),
      position: spec.position ?? besideCentered,
      padding: spec.padding ?? 10,
    };
    if (spec.highlightedSelectors) {
      step.highlightedSelectors = spec.highlightedSelectors;
    }

    const hasEnter =
      spec.saveStateOnEnter || !!spec.section || spec.waitForSelectorOnEnter;
    if (hasEnter) {
      step.action = async () => {
        if (spec.saveStateOnEnter) saveAdminState();
        if (spec.section) navigateToSection(spec.section);
        if (spec.waitForSelectorOnEnter) {
          await waitForElement(spec.selector, 5000);
          await waitForHighlightable(spec.selector, 5000);
        }
      };
    }

    const hasAfter = spec.openConfigAfter || !!spec.scrollToAfter;
    if (hasAfter) {
      step.actionAfter = async () => {
        if (spec.openConfigAfter) openConfigModal();
        if (spec.scrollToAfter) await scrollNavToSection(spec.scrollToAfter);
      };
    }

    return step;
  };

  return ADMIN_STEP_SPECS.reduce(
    (acc, spec) => {
      acc[spec.step] = build(spec);
      return acc;
    },
    {} as Record<AdminTourStep, StepType>,
  );
}
