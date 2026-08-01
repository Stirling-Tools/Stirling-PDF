import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
// The shared preview only loads the portal tokens; the onboarding modal reads
// the editor theme tokens (--bg-surface, --onboarding-title, …), so load them
// here or the modal surface renders transparent over the dark overlay.
import "@app/styles/theme.css";
import OnboardingModalSlide from "@app/components/onboarding/OnboardingModalSlide";
import {
  SLIDE_DEFINITIONS,
  type SlideId,
  type SlideFactoryParams,
} from "@app/components/onboarding/onboardingFlowConfig";
import {
  DEFAULT_RUNTIME_STATE,
  type OnboardingRuntimeState,
} from "@app/components/onboarding/orchestrator/onboardingConfig";

/**
 * Every onboarding modal slide, rendered through the real
 * {@link OnboardingModalSlide} + {@link SLIDE_DEFINITIONS} so design changes
 * here reflect the production flow. Each story is one slide (or a meaningful
 * variant of one), including its hero, stepper and action buttons.
 */

// Sensible defaults for every slide factory; individual stories override the
// few fields their slide actually reads.
const BASE_PARAMS: SlideFactoryParams = {
  osLabel: "macOS (Apple Silicon)",
  osUrl: "#",
  osOptions: [
    { label: "macOS (Apple Silicon)", url: "#", value: "mac-arm" },
    { label: "macOS (Intel)", url: "#", value: "mac-intel" },
    { label: "Windows", url: "#", value: "windows" },
    { label: "Linux", url: "#", value: "linux" },
  ],
  onDownloadUrlChange: () => {},
  selectedRole: null,
  onRoleSelect: () => {},
  licenseNotice: {
    totalUsers: null,
    freeTierLimit: 5,
    isOverLimit: false,
    requiresLicense: false,
  },
  loginEnabled: true,
  firstLoginUsername: "admin",
  onPasswordChanged: () => {},
  usingDefaultCredentials: false,
  analyticsError: null,
  analyticsLoading: false,
  onMfaSetupComplete: () => {},
};

interface SlideStageProps {
  slideId: SlideId;
  params?: Partial<SlideFactoryParams>;
  runtime?: Partial<OnboardingRuntimeState>;
  allowDismiss?: boolean;
  /**
   * Total steps in the flow. Defaults to 1 → a single standalone card with no
   * progress bar or step pill (how the SaaS checklist items render). Set > 1
   * only to demonstrate the stepped-flow treatment.
   */
  stepCount?: number;
  /** 0-based active step, used only when stepCount > 1. */
  stepIndex?: number;
}

function SlideStage({
  slideId,
  params,
  runtime,
  allowDismiss = true,
  stepCount = 1,
  stepIndex = 0,
}: SlideStageProps) {
  const merged: SlideFactoryParams = { ...BASE_PARAMS, ...params };
  // Live role selection so the SecurityCheck dropdown + its gated "Next" button
  // behave the same way they do in the real flow.
  const [selectedRole, setSelectedRole] = useState(merged.selectedRole);

  const definition = SLIDE_DEFINITIONS[slideId];
  const slideContent = definition.createSlide({
    ...merged,
    selectedRole,
    onRoleSelect: setSelectedRole,
  });

  const runtimeState: OnboardingRuntimeState = {
    ...DEFAULT_RUNTIME_STATE,
    ...runtime,
    selectedRole,
    licenseNotice: merged.licenseNotice ?? DEFAULT_RUNTIME_STATE.licenseNotice,
  };

  return (
    <OnboardingModalSlide
      slideDefinition={definition}
      slideContent={slideContent}
      runtimeState={runtimeState}
      modalSlideCount={stepCount}
      currentModalSlideIndex={stepIndex}
      onSkip={() => {}}
      onAction={() => {}}
      allowDismiss={allowDismiss}
    />
  );
}

const meta: Meta<typeof SlideStage> = {
  title: "Onboarding/Modal Slides",
  component: SlideStage,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SlideStage>;

/** "Welcome to Stirling" — the V2 intro slide (rocket hero). */
export const Welcome: Story = { args: { slideId: "welcome" } };

/** The only stepped example: a multi-step flow shows the step pill + progress
 * bar. Every other story is a standalone single card (no steps). */
export const SteppedFlowExample: Story = {
  args: { slideId: "admin-overview", stepCount: 9, stepIndex: 4 },
};

/** Force a password change on first login (user types current + new). */
export const FirstLogin: Story = { args: { slideId: "first-login" } };

/** First login when the account is still on the default `stirling` password —
 * the current-password field is hidden. */
export const FirstLoginDefaultCredentials: Story = {
  args: {
    slideId: "first-login",
    params: { usingDefaultCredentials: true },
  },
};

/** Desktop app download prompt with an OS picker (dual-icon hero). */
export const DesktopInstall: Story = { args: { slideId: "desktop-install" } };

/** Role confirmation — the "Next" button stays disabled until a role is picked. */
export const SecurityCheck: Story = { args: { slideId: "security-check" } };

/** Admin overview with login mode already enabled (diamond hero). */
export const AdminOverviewLoginEnabled: Story = {
  args: {
    slideId: "admin-overview",
    params: { loginEnabled: true },
  },
};

/** Admin overview before login mode is enabled — different body copy. */
export const AdminOverviewLoginDisabled: Story = {
  args: {
    slideId: "admin-overview",
    params: { loginEnabled: false },
  },
};

/** Server license, within the free tier. */
export const ServerLicense: Story = {
  args: {
    slideId: "server-license",
    params: {
      licenseNotice: {
        totalUsers: 3,
        freeTierLimit: 5,
        isOverLimit: false,
        requiresLicense: false,
      },
    },
  },
};

/** Server license, over the free-tier seat limit — "Upgrade now" CTA. */
export const ServerLicenseOverLimit: Story = {
  args: {
    slideId: "server-license",
    params: {
      licenseNotice: {
        totalUsers: 12,
        freeTierLimit: 5,
        isOverLimit: true,
        requiresLicense: true,
      },
    },
  },
};

/** Quick tour offer before dropping the user into the tools. */
export const TourOverview: Story = { args: { slideId: "tour-overview" } };

/** Opt-in analytics choice (analytics hero). */
export const AnalyticsChoice: Story = { args: { slideId: "analytics-choice" } };

/** Analytics choice showing an error banner (e.g. save failed). */
export const AnalyticsChoiceError: Story = {
  args: {
    slideId: "analytics-choice",
    params: { analyticsError: "Couldn't save your analytics preference." },
  },
};

/** Two-factor setup (fetches a QR on mount; shows its error state without a
 * backend in Storybook). */
export const MfaSetup: Story = { args: { slideId: "mfa-setup" } };
