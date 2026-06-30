import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@shared/components";
import { LinkGate } from "@portal/components/account-link/LinkGate";

const meta: Meta<typeof LinkGate> = {
  title: "Portal/AccountLink/LinkGate",
  component: LinkGate,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof LinkGate>;

/**
 * Gating follows the Link toolbar global: "Unlinked" shows the lock prompt,
 * any linked state renders the feature.
 */
export const Default: Story = {
  args: {
    feature: "AI extraction",
    children: (
      <Card padding="loose">A billable feature, unlocked once linked.</Card>
    ),
  },
};
