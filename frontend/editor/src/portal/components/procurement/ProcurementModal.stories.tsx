import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Card } from "@app/ui";
import { ProcurementModal } from "@portal/components/procurement/ProcurementModal";

/**
 * The full-screen takeover modal shell. Rendered always-open here to verify the panel has a solid
 * (not see-through) surface over the dimmed, blurred backdrop.
 */
const meta: Meta<typeof ProcurementModal> = {
  title: "Portal/Procurement/ProcurementModal",
  component: ProcurementModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => {},
    title: "Enterprise procurement",
    subtitle: "Get your team evaluated, contracted, and onboarded.",
  },
};
export default meta;

type Story = StoryObj<typeof ProcurementModal>;

export const Open: Story = {
  args: {
    children: (
      <Card padding="loose">
        <h3 style={{ margin: 0 }}>Ready for payment</h3>
        <p style={{ color: "var(--color-text-3)" }}>
          Your quote is accepted. Continue to checkout to pay your committed
          contract and go live.
        </p>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <Button variant="primary" accent="premium">
            Continue to checkout
          </Button>
          <Button variant="secondary">Edit quote</Button>
        </div>
      </Card>
    ),
  },
};
