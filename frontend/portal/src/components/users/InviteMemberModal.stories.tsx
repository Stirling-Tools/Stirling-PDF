import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteMemberModal } from "@portal/components/users/InviteMemberModal";

const meta: Meta<typeof InviteMemberModal> = {
  title: "Portal/Users/InviteMemberModal",
  component: InviteMemberModal,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof InviteMemberModal>;

/** Email + role; Send invite validates locally then closes (demo shell). */
export const Open: Story = {};

export const Closed: Story = { args: { open: false } };
