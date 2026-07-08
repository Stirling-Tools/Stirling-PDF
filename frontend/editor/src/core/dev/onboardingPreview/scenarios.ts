import type { TFunction } from "i18next";
import type { StepType } from "@reactour/tour";
import {
  ONBOARDING_STEPS,
  DEFAULT_RUNTIME_STATE,
  type OnboardingRuntimeState,
  type OnboardingConditionContext,
} from "@app/components/onboarding/orchestrator/onboardingConfig";
import type { SlideId } from "@app/components/onboarding/onboardingFlowConfig";
import { createAdminStepsConfig } from "@app/components/onboarding/adminStepsConfig";
import { createUserStepsConfig } from "@app/components/onboarding/userStepsConfig";
import { createWhatsNewStepsConfig } from "@app/components/onboarding/whatsNewStepsConfig";

/**
 * Dev-only onboarding preview harness.
 *
 * These scenarios let us eyeball exactly which slides and tours each persona
 * sees without wiring the whole orchestrator. Slide sequences are resolved from
 * the real {@link ONBOARDING_STEPS} condition table, so this doubles as a living
 * check of the flow logic — if the conditions change, the preview changes.
 *
 * This module is the extension seam: other build flavors override it (via the
 * `@app/*` cascade) to contribute their own scenarios — e.g. `saas/` adds the
 * SaaS wallet/team flow, `portal/` adds portal onboarding. A build can only
 * render the components that exist in its own layer, so each flavor previews
 * its own real UI. Run the SaaS build to preview SaaS, etc.
 */

export type PreviewTourType = "admin" | "tools" | "whatsnew";

export interface PreviewScenario {
  id: string;
  /** Grouping label for the scenario picker. */
  group: string;
  /** Short persona name. */
  label: string;
  /** One-line description of who this is and what triggers it. */
  blurb: string;
  /** Runtime state used to render the slides (role, license, username, …). */
  runtimeState: OnboardingRuntimeState;
  /** Context used to resolve the slide flow from the real condition table. */
  conditionContext: OnboardingConditionContext;
  /**
   * Explicit slide list, bypassing the condition table. Used for the
   * "interrupt" personas (first-login, MFA, analytics consent) that short-circuit
   * the normal flow in the real orchestrator.
   */
  slidesOverride?: SlideId[];
  /** Guided tour this persona is funnelled into, if any. */
  leadsToTour?: PreviewTourType;
}

interface ScenarioInput {
  id: string;
  group: string;
  label: string;
  blurb: string;
  runtime?: Partial<OnboardingRuntimeState>;
  loginEnabled?: boolean;
  effectiveIsAdmin?: boolean;
  slidesOverride?: SlideId[];
  leadsToTour?: PreviewTourType;
}

function scenario(input: ScenarioInput): PreviewScenario {
  const runtimeState: OnboardingRuntimeState = {
    ...DEFAULT_RUNTIME_STATE,
    ...input.runtime,
  };
  const loginEnabled = input.loginEnabled ?? true;
  const effectiveIsAdmin = input.effectiveIsAdmin ?? false;
  return {
    id: input.id,
    group: input.group,
    label: input.label,
    blurb: input.blurb,
    runtimeState,
    conditionContext: { ...runtimeState, loginEnabled, effectiveIsAdmin },
    slidesOverride: input.slidesOverride,
    leadsToTour: input.leadsToTour,
  };
}

const overLimitLicense = {
  totalUsers: 8,
  freeTierLimit: 5,
  isOverLimit: true,
  requiresLicense: true,
};

const CORE_SCENARIOS: PreviewScenario[] = [
  scenario({
    id: "core-admin-fresh",
    group: "Editor · admin",
    label: "New admin (fresh server)",
    blurb:
      "First admin on a fresh, within-free-tier server. Welcome → admin overview → desktop install, then the admin tour.",
    effectiveIsAdmin: true,
    leadsToTour: "admin",
  }),
  scenario({
    id: "core-admin-overlimit",
    group: "Editor · admin",
    label: "New admin (over free-tier limit)",
    blurb:
      "Admin on a server past the free user limit — the server-license slide is added to the flow.",
    effectiveIsAdmin: true,
    runtime: { licenseNotice: overLimitLicense },
    leadsToTour: "admin",
  }),
  scenario({
    id: "core-user-fresh",
    group: "Editor · user",
    label: "New regular user",
    blurb:
      "Non-admin first login. Welcome → desktop install → tour overview, then the guided tools tour.",
    effectiveIsAdmin: false,
    runtime: { tourType: "whatsnew" },
    leadsToTour: "whatsnew",
  }),
  scenario({
    id: "core-first-login",
    group: "Editor · interrupts",
    label: "First login — must change password",
    blurb:
      "Default credentials in use. Blocks everything else until the password is changed, then forces re-login.",
    effectiveIsAdmin: true,
    runtime: {
      requiresPasswordChange: true,
      firstLoginUsername: "admin",
      usingDefaultCredentials: true,
    },
    slidesOverride: ["first-login"],
  }),
  scenario({
    id: "core-mfa",
    group: "Editor · interrupts",
    label: "MFA setup required",
    blurb: "Server policy requires MFA enrolment before continuing.",
    runtime: { requiresMfaSetup: true },
    slidesOverride: ["mfa-setup"],
  }),
  scenario({
    id: "core-analytics",
    group: "Editor · interrupts",
    label: "Admin — analytics consent",
    blurb:
      "Admin on a server where analytics has not been configured yet — shown before the rest of onboarding.",
    effectiveIsAdmin: true,
    runtime: { analyticsNotConfigured: true },
    slidesOverride: ["analytics-choice"],
  }),
  scenario({
    id: "desktop-admin",
    group: "Editor · desktop",
    label: "Desktop admin",
    blurb:
      "Desktop app has its own welcome/install, so those slides are skipped — admin overview only, then the admin tour.",
    effectiveIsAdmin: true,
    runtime: { isDesktopApp: true },
    leadsToTour: "admin",
  }),
];

/**
 * Returns the scenarios available in this build. Override in a leaf layer to
 * contribute flavor-specific personas (see module docstring).
 */
export function getOnboardingPreviewScenarios(): PreviewScenario[] {
  return CORE_SCENARIOS;
}

/**
 * Resolves the ordered slide sequence a scenario shows. Interrupt scenarios use
 * their explicit override; everything else is filtered from the real condition
 * table so the preview stays truthful to production.
 */
export function resolvePreviewSlides(scn: PreviewScenario): SlideId[] {
  if (scn.slidesOverride) return scn.slidesOverride;
  return ONBOARDING_STEPS.filter(
    (step) => !!step.slideId && step.condition(scn.conditionContext),
  ).map((step) => step.slideId as SlideId);
}

export interface TourStepPreview {
  selector: string;
  content: string;
  position: string;
}

export interface TourPreview {
  id: PreviewTourType;
  label: string;
  steps: TourStepPreview[];
}

const noop = () => {};

function toStepPreviews(config: Record<number, StepType>): TourStepPreview[] {
  return Object.values(config).map((step) => ({
    selector: typeof step.selector === "string" ? step.selector : "(element)",
    content: typeof step.content === "string" ? step.content : "",
    position: typeof step.position === "string" ? step.position : "auto",
  }));
}

/** Builds the step-by-step content of each guided tour for the inspector. */
export function getTourPreviews(t: TFunction): TourPreview[] {
  const admin = createAdminStepsConfig({
    t,
    actions: {
      saveAdminState: noop,
      openConfigModal: noop,
      navigateToSection: noop,
      scrollNavToSection: noop,
    },
  });
  const user = createUserStepsConfig({
    t,
    actions: {
      saveWorkbenchState: noop,
      closeFilesModal: noop,
      backToAllTools: noop,
      selectCropTool: noop,
      loadSampleFile: noop,
      switchToActiveFiles: noop,
      pinFile: noop,
      revealFileCardHoverMenu: noop,
      modifyCropSettings: noop,
      executeTool: noop,
      openFilesModal: noop,
      openSettingsHelpSection: noop,
    },
  });
  const whatsNew = createWhatsNewStepsConfig({
    t,
    actions: {
      saveWorkbenchState: noop,
      closeFilesModal: noop,
      backToAllTools: noop,
      openFilesModal: noop,
      loadSampleFile: noop,
      switchToViewer: noop,
      switchToPageEditor: noop,
      switchToActiveFiles: noop,
    },
  });

  return [
    { id: "admin", label: "Admin tour", steps: toStepPreviews(admin) },
    { id: "tools", label: "User tour", steps: toStepPreviews(user) },
    {
      id: "whatsnew",
      label: "What's new tour",
      steps: toStepPreviews(whatsNew),
    },
  ];
}
