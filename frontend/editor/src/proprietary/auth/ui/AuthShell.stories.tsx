import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthShell } from "@app/auth/ui/AuthShell";

/**
 * The login card shell shared by the editor and the portal: a centered card
 * that expands to two columns (form + right panel) on wide/tall viewports.
 */
const meta = {
  title: "Auth/Auth Shell",
  component: AuthShell,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AuthShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <h2>Sign in</h2>
        <p>Enter your credentials to continue.</p>
      </div>
    ),
  },
};

export const WithRightPanel: Story = {
  args: {
    children: (
      <div>
        <h2>Sign in</h2>
        <p>Enter your credentials to continue.</p>
      </div>
    ),
    rightPanel: (
      <div style={{ padding: "2rem" }}>
        <h3>Why Stirling PDF?</h3>
        <p>Fast, secure, self-hostable PDF tooling.</p>
      </div>
    ),
  },
};

export const WithFooter: Story = {
  args: {
    children: (
      <div>
        <h2>Sign in</h2>
        <p>Enter your credentials to continue.</p>
      </div>
    ),
    footer: (
      <div style={{ padding: "0.5rem", textAlign: "center" }}>
        © Stirling PDF
      </div>
    ),
  },
};
