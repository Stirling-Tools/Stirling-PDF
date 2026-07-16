import type { Meta, StoryObj } from "@storybook/react-vite";
import AccountSection from "@app/components/shared/config/configSections/AccountSection";

/**
 * Account settings panel shown inside the app config modal: password /
 * username management and two-factor authentication setup.
 */
const meta: Meta<typeof AccountSection> = {
  title: "Config/AccountSection",
  component: AccountSection,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
