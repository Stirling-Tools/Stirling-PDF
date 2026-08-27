import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsNavChevron } from "@app/components/shared/config/SettingsNavChevron";
import "@app/components/shared/AppConfigModal.css";

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
