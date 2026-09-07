import type { Meta, StoryObj } from "@storybook/react-vite";
import HelpSection from "@app/components/shared/config/configSections/HelpSection";

const meta = {
  title: "Shared/Config/ConfigSections/HelpSection",
  component: HelpSection,
  parameters: { layout: "padded" },
  args: {
    onRequestClose: () => {},
  },
} satisfies Meta<typeof HelpSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isAdmin: false,
  },
};

export const Admin: Story = {
  args: {
    isAdmin: true,
  },
};
