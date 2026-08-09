import type { Meta, StoryObj } from "@storybook/react-vite";
import AuthCallback from "@app/routes/AuthCallback";
import "@app/auth/ui/auth.css";

/**
 * The landing screen an OAuth or SSO provider redirects back to. It has a
 * single visual state — a branded "completing authentication" card with a
 * spinner — because every outcome of the token exchange resolves by
 * navigating elsewhere: on to the requested page, or back to the login screen
 * carrying an error. Only the waiting moment is ever rendered here.
 *
 * With no token in the URL fragment the route redirects immediately, so the
 * story shows the card as the user sees it during a real exchange.
 */
const meta: Meta<typeof AuthCallback> = {
  title: "Auth/Auth Callback",
  component: AuthCallback,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof AuthCallback>;

export const Default: Story = {};
