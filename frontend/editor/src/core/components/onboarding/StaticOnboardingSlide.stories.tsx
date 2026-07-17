import type { Meta, StoryObj } from "@storybook/react-vite";
// The shared preview only loads the portal tokens; the onboarding modal reads
// the editor theme tokens (--bg-surface, --onboarding-title, …), so load them
// here or the modal surface renders transparent over the dark overlay.
import "@app/styles/theme.css";
import StaticOnboardingSlide from "@app/components/onboarding/StaticOnboardingSlide";
import { DEFAULT_RUNTIME_STATE } from "@app/components/onboarding/orchestrator/onboardingConfig";

/**
 * Renders the "interrupt" onboarding modals — slides shown outside the normal
 * step flow (analytics consent, first-login password change, MFA setup, the
 * external server-license notice) — each with dismissal disabled, since none
 * of these can be skipped by the user.
 */
const meta = {
  title: "Onboarding/Static Onboarding Slide",
  component: StaticOnboardingSlide,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof StaticOnboardingSlide>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Opt-in analytics choice, shown once after first login. */
export const AnalyticsChoice: Story = {
  args: {
    slideId: "analytics-choice",
    runtimeState: DEFAULT_RUNTIME_STATE,
    params: { analyticsError: null, analyticsLoading: false },
    onSkip: () => {},
    onAction: () => {},
    allowDismiss: false,
  },
};

/** Forced password change on first login with the default credentials. */
export const FirstLogin: Story = {
  args: {
    slideId: "first-login",
    runtimeState: {
      ...DEFAULT_RUNTIME_STATE,
      requiresPasswordChange: true,
      firstLoginUsername: "admin",
      usingDefaultCredentials: true,
    },
    params: {
      firstLoginUsername: "admin",
      onPasswordChanged: () => {},
      usingDefaultCredentials: true,
    },
    onSkip: () => {},
    onAction: () => {},
    allowDismiss: false,
  },
};

/** Two-factor setup, triggered when the account requires MFA. */
export const MfaSetup: Story = {
  args: {
    slideId: "mfa-setup",
    runtimeState: { ...DEFAULT_RUNTIME_STATE, requiresMfaSetup: true },
    params: { onMfaSetupComplete: () => {} },
    onSkip: () => {},
    onAction: () => {},
    allowDismiss: false,
  },
};

/** External license notice — the back button is stripped via
 * `transformButtons` since there's no prior slide to return to. */
export const ServerLicenseNotice: Story = {
  args: {
    slideId: "server-license",
    transformButtons: (buttons) =>
      buttons.filter((btn) => btn.key !== "license-back"),
    runtimeState: {
      ...DEFAULT_RUNTIME_STATE,
      licenseNotice: {
        totalUsers: 12,
        freeTierLimit: 5,
        isOverLimit: true,
        requiresLicense: true,
      },
    },
    params: {
      osOptions: [],
      onDownloadUrlChange: () => {},
      licenseNotice: {
        totalUsers: 12,
        freeTierLimit: 5,
        isOverLimit: true,
        requiresLicense: true,
      },
      loginEnabled: true,
    },
    onSkip: () => {},
    onAction: () => {},
    allowDismiss: false,
  },
};
