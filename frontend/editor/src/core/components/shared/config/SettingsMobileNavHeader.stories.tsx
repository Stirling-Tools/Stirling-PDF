import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsMobileNavHeader } from "@app/components/shared/config/SettingsMobileNavHeader";
import "@app/components/shared/AppConfigModal.css";

const meta = {
  title: "Shared/Config/SettingsMobileNavHeader",
  component: SettingsMobileNavHeader,
  parameters: { layout: "padded" },
  args: {
    show: true,
    onClose: () => {},
    background: "var(--c-bg-raised)",
    borderColor: "var(--c-border-subtle)",
  },
} satisfies Meta<typeof SettingsMobileNavHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hidden: Story = {
  args: { show: false },
};
