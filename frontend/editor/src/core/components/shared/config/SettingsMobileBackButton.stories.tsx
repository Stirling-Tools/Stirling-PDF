import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsMobileBackButton } from "@app/components/shared/config/SettingsMobileBackButton";

const meta = {
  title: "Shared/Config/SettingsMobileBackButton",
  component: SettingsMobileBackButton,
  parameters: { layout: "padded" },
  args: { show: true, onClick: () => {} },
} satisfies Meta<typeof SettingsMobileBackButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hidden: Story = {
  args: { show: false },
};
