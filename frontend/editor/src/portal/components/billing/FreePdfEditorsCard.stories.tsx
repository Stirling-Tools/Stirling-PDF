import type { Meta, StoryObj } from "@storybook/react-vite";
import { FreePdfEditorsCard } from "@portal/components/billing/FreePdfEditorsCard";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof FreePdfEditorsCard> = {
  title: "Portal/Billing/FreePdfEditorsCard",
  component: FreePdfEditorsCard,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof FreePdfEditorsCard>;

/**
 * The team editor-fleet card. The metrics are SAMPLE data (flagged with the
 * Preview badge) until the fleet-telemetry endpoint lands in a follow-up PR;
 * "Invite teammates" is intentionally inert for now.
 */
export const Default: Story = {};
