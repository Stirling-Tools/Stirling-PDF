import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildUsersResponse } from "@portal/mocks/users";
import { UsersSummaryStrip } from "@portal/components/users/UsersSummaryStrip";

const meta: Meta<typeof UsersSummaryStrip> = {
  title: "Portal/Users/UsersSummaryStrip",
  component: UsersSummaryStrip,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof UsersSummaryStrip>;

export const Pro: Story = {
  args: { data: buildUsersResponse("pro"), loading: false },
};

/** Enterprise shows unlimited seats. */
export const Enterprise: Story = {
  args: { data: buildUsersResponse("enterprise"), loading: false },
};

/** Free sits near its seat ceiling. */
export const Free: Story = {
  args: { data: buildUsersResponse("free"), loading: false },
};

/** Loading collapses every card to the placeholder dash. */
export const Loading: Story = {
  args: { data: null, loading: true },
};
