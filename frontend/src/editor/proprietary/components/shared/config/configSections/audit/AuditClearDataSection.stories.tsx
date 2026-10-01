import type { Meta, StoryObj } from "@storybook/react-vite";
import AuditClearDataSection from "@app/components/shared/config/configSections/audit/AuditClearDataSection";

/**
 * Destructive action card for permanently clearing all audit logs, gated
 * behind a randomly generated confirmation code the user must retype.
 */
const meta: Meta<typeof AuditClearDataSection> = {
  title: "Config/Audit/AuditClearDataSection",
  component: AuditClearDataSection,
  parameters: { layout: "padded" },
  args: {
    loginEnabled: true,
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** When login is disabled, the delete action is disabled too. */
export const LoginDisabled: Story = {
  args: { loginEnabled: false },
};
