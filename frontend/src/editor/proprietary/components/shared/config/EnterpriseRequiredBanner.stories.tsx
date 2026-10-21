import type { Meta, StoryObj } from "@storybook/react-vite";
import EnterpriseRequiredBanner from "@app/components/shared/config/EnterpriseRequiredBanner";

/**
 * Banner explaining that an enterprise-only feature is running in demo mode.
 */
const meta: Meta<typeof EnterpriseRequiredBanner> = {
  title: "Config/EnterpriseRequiredBanner",
  component: EnterpriseRequiredBanner,
  parameters: { layout: "padded" },
  args: {
    show: true,
    featureName: "Audit Logs",
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** When `show` is false the banner renders nothing. */
export const Hidden: Story = {
  args: { show: false },
};
