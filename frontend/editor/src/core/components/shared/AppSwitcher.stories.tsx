import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppSwitcher } from "@app/components/shared/AppSwitcher";

/** Core stub: renders nothing (only proprietary/saas builds have a portal to switch to). */
const meta: Meta<typeof AppSwitcher> = {
  title: "Shared/AppSwitcher",
  component: AppSwitcher,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
