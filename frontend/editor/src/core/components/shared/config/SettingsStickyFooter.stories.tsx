import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingsStickyFooter } from "@app/components/shared/config/SettingsStickyFooter";

const meta = {
  title: "Shared/Config/SettingsStickyFooter",
  component: SettingsStickyFooter,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SettingsStickyFooter>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isDirty: true,
    saving: false,
    loginEnabled: true,
    onSave: () => {},
    onDiscard: () => {},
  },
};

export const Saving: Story = {
  args: {
    ...Default.args,
    saving: true,
  },
};

export const Hidden: Story = {
  args: {
    ...Default.args,
    isDirty: false,
  },
};
