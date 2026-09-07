import type { Meta, StoryObj } from "@storybook/react-vite";
import { PendingInvitations } from "@portal/components/users/PendingInvitations";
import type { PendingInvitation } from "@portal/api/users";

const INVITATIONS: PendingInvitation[] = [
  {
    id: 1,
    email: "priya@stirlingpdf.com",
    invitedBy: "tom@stirlingpdf.com",
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  },
  {
    id: 2,
    email: "lars@stirlingpdf.com",
    invitedBy: "dana@stirlingpdf.com",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 3,
    email: "legal@meridian-partners.com",
  },
];

const meta: Meta<typeof PendingInvitations> = {
  title: "Portal/Users/PendingInvitations",
  component: PendingInvitations,
  parameters: { layout: "padded" },
  args: {
    invitations: INVITATIONS,
    onCancel: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PendingInvitations>;

/** A mix of invites: one expiring today, one expiring soon, one with no expiry. */
export const Default: Story = {};

/** Single invite, expiring today. */
export const ExpiresToday: Story = {
  args: {
    invitations: [
      {
        id: 1,
        email: "priya@stirlingpdf.com",
        invitedBy: "tom@stirlingpdf.com",
        expiresAt: new Date(Date.now() + 3 * 3600000).toISOString(),
      },
    ],
  },
};

/** No pending invites: header still renders with a zero count. */
export const Empty: Story = {
  args: { invitations: [] },
};
