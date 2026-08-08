import type { Meta, StoryObj } from "@storybook/react-vite";
import LoginHeader from "@app/routes/login/LoginHeader";
import "@app/auth/ui/auth.css";

/**
 * The wordmark-and-title block that opens every auth screen. The wordmark
 * variant is resolved from the user's logo preference and the active colour
 * scheme, so it needs no props; what callers vary is the copy (title, optional
 * subtitle) and whether the block is centred.
 */
const meta: Meta<typeof LoginHeader> = {
  title: "Auth/Login Header",
  component: LoginHeader,
  parameters: { layout: "centered" },
  args: {
    title: "Sign in to Stirling PDF",
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof LoginHeader>;

export const Default: Story = {};

/** Screens that need a line of guidance beneath the title pass a subtitle. */
export const WithSubtitle: Story = {
  args: {
    subtitle: "Enter your credentials to continue.",
  },
};

/**
 * Centred layout, used where the header stands alone rather than above a
 * left-aligned form — status and callback screens, for instance.
 */
export const Centered: Story = {
  args: {
    subtitle: "Enter your credentials to continue.",
    centerOnly: true,
  },
};

/** Long titles wrap within the card instead of widening it. */
export const LongTitle: Story = {
  args: {
    title: "Sign in to continue to your organisation's document workspace",
  },
};
