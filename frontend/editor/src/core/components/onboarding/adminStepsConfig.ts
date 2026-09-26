import type { StepType } from "@reactour/tour";
import type { TFunction } from "i18next";
import {
  addGlowToElements,
  removeAllGlows,
} from "@app/components/onboarding/tourGlow";
import {
  waitForElement,
  waitForHighlightable,
} from "@app/components/onboarding/tourUtils";

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

// Delay before applying glow so the target section has mounted after navigation.
const GLOW_DELAY_MS = 100;

/**
 * Declarative spec for an admin tour step. Most steps do the same thing —
 * clear existing glows, navigate to a settings section, then glow a set of nav
 * items — so that behaviour is expressed as data (`section` + `glow`) and the
 * runner below turns it into the reactour enter/after hooks. This replaces the
 * removeGlow→navigate→setTimeout→addGlow block that was previously copy-pasted
 * into every step.
 */
interface AdminStepSpec {
  step: AdminTourStep;
  selector: string;
  contentKey: string;
  contentDefault: string;
  position: StepType["position"];
  padding?: number;
  highlightedSelectors?: string[];
  /** Navigate to this settings section on enter (clears glows first). */
  section?: string;
  /** Selectors to glow shortly after navigating to `section`. */
  glow?: string[];
  /** Clear glows on enter without navigating (settings-overview step). */
  clearGlowOnEnter?: boolean;
  /** Save admin/workbench state on enter (first step). */
  saveStateOnEnter?: boolean;
  /** Open the config modal after this step (config-button step). */
  openConfigAfter?: boolean;
  /** Scroll the settings nav to this section after this step. */
  scrollToAfter?: string;
  /** Wait for the step's own selector to be present + highlightable on enter. */
  waitForSelectorOnEnter?: boolean;
}

const NAV = {
  users: [
    '[data-tour="admin-users-nav"]',
    '[data-tour="settings-content-area"]',
  ],
  adminGeneral: [
    '[data-tour="admin-adminGeneral-nav"]',
    '[data-tour="settings-content-area"]',
  ],
  adminAdvanced: [
    '[data-tour="admin-adminAdvanced-nav"]',
    '[data-tour="settings-content-area"]',
  ],
  adminSecurity: [
    '[data-tour="admin-adminSecurity-nav"]',
    '[data-tour="settings-content-area"]',
  ],
  adminTools: [
    '[data-tour="admin-adminAudit-nav"]',
    '[data-tour="admin-adminUsage-nav"]',
    '[data-tour="settings-content-area"]',
  ],
} as const;

const ADMIN_STEP_SPECS: AdminStepSpec[] = [
  {
    step: AdminTourStep.WELCOME,
    selector: '[data-tour="config-button"]',
    contentKey: "adminOnboarding.welcome",
    contentDefault:
      "Welcome to the <strong>Admin Tour</strong>. It covers the enterprise features and settings available to administrators.",
    position: "right",
    saveStateOnEnter: true,
  },
  {
    step: AdminTourStep.CONFIG_BUTTON,
    selector: '[data-tour="config-button"]',
    contentKey: "adminOnboarding.configButton",
    contentDefault:
      "Open <strong>Settings</strong> to access all system configuration and administrative controls.",
    position: "right",
    openConfigAfter: true,
  },
  {
    step: AdminTourStep.SETTINGS_OVERVIEW,
    selector: ".modal-nav",
    contentKey: "adminOnboarding.settingsOverview",
    contentDefault:
      "This is the <strong>Settings Panel</strong>. Admin settings are grouped by category.",
    position: "right",
    padding: 0,
    clearGlowOnEnter: true,
  },
  {
    step: AdminTourStep.TEAMS_AND_USERS,
    selector: '[data-tour="admin-users-nav"]',
    contentKey: "adminOnboarding.teamsAndUsers",
    contentDefault:
      "Manage <strong>Teams</strong> and individual users here. You can invite new users via email, shareable links, or create custom accounts for them yourself.",
    position: "right",
    section: "users",
    glow: [...NAV.users],
    highlightedSelectors: [...NAV.users],
  },
  {
    step: AdminTourStep.SYSTEM_CUSTOMIZATION,
    selector: '[data-tour="admin-adminGeneral-nav"]',
    contentKey: "adminOnboarding.systemCustomization",
    contentDefault:
      "<strong>System Settings</strong> changes the app name and languages, <strong>Features</strong> manages the server certificate, and <strong>Endpoints</strong> turns tools on or off for your users.",
    position: "right",
    section: "adminGeneral",
    glow: [...NAV.adminGeneral],
    highlightedSelectors: [...NAV.adminGeneral],
  },
  {
    step: AdminTourStep.DATABASE_SECTION,
    selector: '[data-tour="admin-adminAdvanced-nav"]',
    contentKey: "adminOnboarding.databaseSection",
    contentDefault:
      "For production environments, you can connect an <strong>external database</strong> to use your existing infrastructure.",
    position: "right",
    section: "adminAdvanced",
    glow: [...NAV.adminAdvanced],
    highlightedSelectors: [...NAV.adminAdvanced],
  },
  {
    step: AdminTourStep.CONNECTIONS_SECTION,
    selector: '[data-tour="admin-adminSecurity-nav"]',
    contentKey: "adminOnboarding.connectionsSection",
    contentDefault:
      "The <strong>Connections</strong> section supports various login methods including custom SSO and SAML providers like Google and GitHub, plus email integrations for notifications and communications.",
    position: "right",
    section: "adminSecurity",
    glow: [...NAV.adminSecurity],
    highlightedSelectors: [...NAV.adminSecurity],
    scrollToAfter: "adminAudit",
  },
  {
    step: AdminTourStep.ADMIN_TOOLS,
    selector: '[data-tour="admin-adminAudit-nav"]',
    contentKey: "adminOnboarding.adminTools",
    contentDefault:
      "<strong>Auditing</strong> tracks system activity and <strong>Usage Analytics</strong> shows how users interact with the platform.",
    position: "right",
    section: "adminAudit",
    glow: [...NAV.adminTools],
    highlightedSelectors: [...NAV.adminTools],
  },
  {
    step: AdminTourStep.WRAP_UP,
    selector: '[data-tour="admin-about-nav"]',
    contentKey: "adminOnboarding.wrapUp",
    contentDefault:
      "That's the end of the admin tour. To replay it, open <strong>Settings</strong> and go to the <strong>Tours</strong> section under Help.",
    position: "right",
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
      position: spec.position,
      padding: spec.padding ?? 10,
    };
    if (spec.highlightedSelectors) {
      step.highlightedSelectors = spec.highlightedSelectors;
    }

    const hasEnter =
      spec.saveStateOnEnter ||
      spec.clearGlowOnEnter ||
      !!spec.section ||
      spec.waitForSelectorOnEnter;
    if (hasEnter) {
      step.action = async () => {
        if (spec.saveStateOnEnter) saveAdminState();
        if (spec.clearGlowOnEnter) removeAllGlows();
        if (spec.section) {
          removeAllGlows();
          navigateToSection(spec.section);
          if (spec.glow) {
            const glow = spec.glow;
            setTimeout(() => addGlowToElements(glow), GLOW_DELAY_MS);
          }
        }
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
