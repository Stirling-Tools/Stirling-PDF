import type { Meta, StoryObj } from "@storybook/react-vite";
import { CardPlaceholder } from "@portal/components/billing/CardPlaceholder";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof CardPlaceholder> = {
  title: "Portal/Billing/CardPlaceholder",
  component: CardPlaceholder,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof CardPlaceholder>;

/** Stand-in card form shown when Stripe isn't mounted (no publishable key / preview). */
export const Default: Story = {};
