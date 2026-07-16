import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyEnforcingOverlay } from "@app/components/shared/PolicyEnforcingOverlay";

/** Web-build stub: renders nothing (real overlay is provided by the proprietary flavor). */
const meta: Meta<typeof PolicyEnforcingOverlay> = {
  title: "Shared/PolicyEnforcingOverlay",
  component: PolicyEnforcingOverlay,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    enforcing: false,
  },
};

export const Enforcing: Story = {
  args: {
    enforcing: true,
    progress: 42,
    zIndex: 2,
    accentVar: "--policy-accent-color",
  },
};
