import type { Meta, StoryObj } from "@storybook/react-vite";
import ChangeUserPasswordModal from "@app/components/shared/ChangeUserPasswordModal";
import type { User } from "@app/services/userManagementService";

const USER: User = {
  id: 1,
  username: "alice@example.com",
  roleName: "adminUserSettings.admin",
  enabled: true,
};

const meta = {
  title: "Shared/ChangeUserPasswordModal",
  component: ChangeUserPasswordModal,
  args: {
    opened: true,
    user: USER,
    mailEnabled: true,
    onClose: () => {},
    onSuccess: () => {},
  },
} satisfies Meta<typeof ChangeUserPasswordModal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** When SMTP notifications aren't configured, the email checkboxes are disabled. */
export const MailDisabled: Story = {
  args: { mailEnabled: false },
};

/** A username that isn't a valid email address also disables the email checkboxes. */
export const NonEmailUsername: Story = {
  args: { user: { ...USER, username: "alice" } },
};
