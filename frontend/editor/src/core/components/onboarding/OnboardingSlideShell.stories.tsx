import type { Meta, StoryObj } from "@storybook/react-vite";
// The shared preview only loads the portal tokens; the shell reads the editor
// theme tokens (--bg-surface, --onboarding-title, …), so load them here or the
// card renders transparent over the dark overlay.
import "@app/styles/theme.css";
import OnboardingSlideShell, {
  ShellHero,
  type ShellButton,
} from "@app/components/onboarding/OnboardingSlideShell";

const meta = {
  title: "Onboarding/Slide Shell",
  component: OnboardingSlideShell,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OnboardingSlideShell>;
export default meta;

type Story = StoryObj<typeof meta>;

const BUTTONS: ShellButton[] = [
  { key: "back", back: true, action: "back" },
  { key: "skip", label: "Skip", action: "skip" },
  { key: "next", label: "Next", primary: true, action: "next" },
];

/** A single standalone card — no step count, so no progress bar or pill. */
export const Default: Story = {
  args: {
    hero: <ShellHero appIcon />,
    slideKey: "default",
    title: "Welcome to Stirling PDF",
    body: "Everything you need to view, edit and manage your PDFs in one place.",
    stepIndex: 0,
    stepCount: 1,
    buttons: [{ key: "next", label: "Next", primary: true, action: "next" }],
    onAction: () => {},
    onClose: () => {},
  },
};

/** Mid-flow step: shows the step pill + progress bar, plus a back control. */
export const SteppedWithBack: Story = {
  args: {
    hero: <ShellHero>2</ShellHero>,
    slideKey: "stepped",
    title: "Choose your role",
    body: "This helps us tailor the tools you see first.",
    stepIndex: 2,
    stepCount: 5,
    buttons: BUTTONS,
    onAction: () => {},
    onClose: () => {},
  },
};

/** Dismiss (close button + escape-to-close) disabled — used for mandatory
 * steps like a forced first-login password change. */
export const NotDismissible: Story = {
  args: {
    hero: <ShellHero appIcon />,
    slideKey: "mandatory",
    title: "Set a new password",
    body: "You're using the default password — choose a new one to continue.",
    stepIndex: 0,
    stepCount: 3,
    buttons: [
      {
        key: "next",
        label: "Continue",
        primary: true,
        action: "next",
        disabled: true,
      },
    ],
    onAction: () => {},
    onClose: () => {},
    allowDismiss: false,
  },
};
