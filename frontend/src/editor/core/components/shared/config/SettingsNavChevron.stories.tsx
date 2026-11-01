import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsNavChevron } from "@editor/components/shared/config/SettingsNavChevron";
import "@editor/components/shared/config/settingsSections.css";

const meta = {
  title: "Shared/Config/SettingsNavChevron",
  component: SettingsNavChevron,
  parameters: { layout: "padded" },
  args: { show: true },
} satisfies Meta<typeof SettingsNavChevron>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hidden: Story = {
  args: { show: false },
};
