import type { Meta, StoryObj } from "@storybook/react";
import OAuthButtons from "@app/auth/ui/OAuthButtons";
import "@app/auth/ui/auth.css";

/**
 * The OAuth provider buttons the login page renders
 */
const meta: Meta<typeof OAuthButtons> = {
  title: "Auth/OAuth Buttons",
  component: OAuthButtons,
  parameters: { layout: "centered" },
  args: {
    onProviderClick: () => {},
    isSubmitting: false,
    enabledProviders: ["google", "github", "apple", "azure"],
  },
};
export default meta;
type Story = StoryObj<typeof OAuthButtons>;

export const Vertical: Story = {
  render: (args) => (
    <div style={{ width: 320 }}>
      <OAuthButtons {...args} layout="vertical" />
    </div>
  ),
};
export const Grid: Story = {
  render: (args) => <OAuthButtons {...args} layout="grid" />,
};
export const Icons: Story = {
  render: (args) => <OAuthButtons {...args} layout="icons" />,
};
