import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResetPasswordModal } from "@portal/components/users/ResetPasswordModal";
import type { Member } from "@portal/api/users";

const MEMBER: Member = {
  id: "3",
  name: "Sarah Kowalski",
  email: "sarah@stirlingpdf.com",
  role: "member",
  status: "active",
  lastActive: "30m ago",
  username: "sarah",
};

const meta: Meta<typeof ResetPasswordModal> = {
  title: "Portal/Users/ResetPasswordModal",
  component: ResetPasswordModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    member: MEMBER,
    mailEnabled: false,
    onClose: () => {},
    onDone: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof ResetPasswordModal>;

/** Auto-generate a secure password (copy + regenerate). */
export const Default: Story = {};

/** With SMTP configured, the admin can email the reset. */
export const WithEmail: Story = { args: { mailEnabled: true } };
