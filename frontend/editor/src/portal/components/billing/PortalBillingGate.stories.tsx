import type { Meta, StoryObj } from "@storybook/react-vite";
import { PortalBillingGate } from "@portal/components/billing/PortalBillingGate";

const meta: Meta<typeof PortalBillingGate> = {
  title: "Portal/Billing/PortalBillingGate",
  component: PortalBillingGate,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

/** Linked org — renders the (flavor-agnostic) Usage page. */
export const Linked: Story = {
  globals: { linkState: "linked-subscribed" },
};

/** Unlinked org — billing gates behind the account-link prompt. */
export const Unlinked: Story = {
  globals: { linkState: "unlinked" },
};
