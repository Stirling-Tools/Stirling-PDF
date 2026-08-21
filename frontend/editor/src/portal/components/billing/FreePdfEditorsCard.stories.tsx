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
 * The team editor-fleet card. Metrics come from GET /api/v1/usage/fleet-stats
 * (audit-derived, free UI runs only); with no backend behind Storybook the
 * fetch fails and the figures fall back to "N/A". Cost is always $0.
 */
export const Default: Story = {};
