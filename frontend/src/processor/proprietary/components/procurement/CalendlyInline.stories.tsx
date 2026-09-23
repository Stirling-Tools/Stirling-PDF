import type { Meta, StoryObj } from "@storybook/react-vite";
import { CalendlyInline } from "@portal/components/procurement/CalendlyInline";
import "@portal/views/Procurement.css";

const meta: Meta<typeof CalendlyInline> = {
  title: "Portal/Procurement/CalendlyInline",
  component: CalendlyInline,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof CalendlyInline>;

// Calendly's widget.js can't reach the network in Storybook, so this renders the
// "unable to load" fallback link rather than the live embed.
export const Default: Story = {};

export const WithPrefilledEmail: Story = {
  args: { email: "buyer@example.com" },
};
