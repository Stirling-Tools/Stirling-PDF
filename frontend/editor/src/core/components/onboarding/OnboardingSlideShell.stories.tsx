import type { Meta, StoryObj } from "@storybook/react-vite";
import RocketLaunchRoundedIcon from "@mui/icons-material/RocketLaunchRounded";
import OnboardingSlideShell, {
  ShellHero,
} from "@app/components/onboarding/OnboardingSlideShell";

/**
 * The frame every onboarding slide sits in: hero panel, copy, step position
 * and the action row. `stepIndex` / `stepCount` drive the progress dots, and
 * `allowDismiss` decides whether the tour can be abandoned.
 */
const meta: Meta<typeof OnboardingSlideShell> = {
  title: "Onboarding/OnboardingSlideShell",
  component: OnboardingSlideShell,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    slideKey: "welcome",
    onAction: () => {},
    onClose: () => {},
    hero: <ShellHero appIcon />,
    title: "Welcome to Stirling PDF",
    body: "Everything you need to work with PDFs, in one place. This tour takes about a minute.",
    stepIndex: 0,
    stepCount: 4,
    buttons: [
      { key: "next", label: "Get started", primary: true, action: "next" },
    ],
  },
};
export default meta;

type Story = StoryObj<typeof OnboardingSlideShell>;

/** The opening slide: app mark, one primary action. */
export const FirstSlide: Story = {};

/** Mid-tour — a back button joins the primary, and the dots advance. */
export const MidTour: Story = {
  args: {
    slideKey: "tools",
    hero: (
      <ShellHero>
        <RocketLaunchRoundedIcon fontSize="large" />
      </ShellHero>
    ),
    title: "Every tool, one click away",
    body: "Search or browse the tool picker. Your recent tools stay pinned to the top.",
    stepIndex: 2,
    stepCount: 4,
    buttons: [
      { key: "back", label: "Back", back: true, action: "back" },
      { key: "next", label: "Next", primary: true, action: "next" },
    ],
  },
};

/** The final slide — the primary action closes the tour. */
export const LastSlide: Story = {
  args: {
    slideKey: "done",
    title: "You're all set",
    body: "You can reopen this tour any time from the help menu.",
    stepIndex: 3,
    stepCount: 4,
    buttons: [
      { key: "back", label: "Back", back: true, action: "back" },
      { key: "finish", label: "Finish", primary: true, action: "finish" },
    ],
  },
};

/** A single-step slide: no progress to show. */
export const SingleStep: Story = {
  args: {
    stepIndex: 0,
    stepCount: 1,
    title: "One thing before you start",
    buttons: [{ key: "ok", label: "Got it", primary: true, action: "close" }],
  },
};

/** A step that cannot be dismissed — the only way on is the action row. */
export const NotDismissable: Story = {
  args: {
    allowDismiss: false,
    title: "Set up two-factor authentication",
    body: "Your administrator requires this before you can continue.",
    buttons: [
      { key: "setup", label: "Set up now", primary: true, action: "setup" },
    ],
  },
};

/** An action that is not yet available — shown rather than hidden, so the
 *  path forward stays visible. */
export const DisabledAction: Story = {
  args: {
    title: "Choose your install",
    body: "Pick a platform to continue.",
    buttons: [
      { key: "back", label: "Back", back: true, action: "back" },
      {
        key: "next",
        label: "Download",
        primary: true,
        action: "next",
        disabled: true,
      },
    ],
  },
};

/** A long body, to check the panel scrolls rather than pushing the actions
 *  off-screen. */
export const LongBody: Story = {
  args: {
    title: "What changed in this release",
    body: (
      <div style={{ display: "grid", gap: "0.75rem", textAlign: "left" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} style={{ margin: 0 }}>
            {i + 1}. Batch processing now runs pipelined rather than serialised,
            so a queue of documents finishes in roughly the time the slowest one
            takes.
          </p>
        ))}
      </div>
    ),
  },
};
