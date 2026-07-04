import type { Meta, StoryObj } from "@storybook/react-vite";
import { membersFor } from "@portal/mocks/users";
import { MembersTable } from "@portal/components/users/MembersTable";

const meta: Meta<typeof MembersTable> = {
  title: "Portal/Users/MembersTable",
  component: MembersTable,
  parameters: { layout: "padded" },
  args: {
    members: membersFor("pro"),
    onChangeRole: () => {},
    onSuspend: () => {},
    onRemove: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof MembersTable>;

/** Pro roster: active members plus an invited and a suspended account. */
export const Default: Story = {};

/** Enterprise adds a Team Owner and a second pending invite. */
export const Enterprise: Story = {
  args: { members: membersFor("enterprise") },
};

export const Free: Story = {
  args: { members: membersFor("free") },
};
