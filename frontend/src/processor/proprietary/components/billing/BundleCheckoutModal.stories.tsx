import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "@app/ui";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import {
  prepaidWallet,
  subscribedWallet,
} from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

// Direct checkout: no quote round-trip. With no Stripe key in Storybook, the pay step falls back
// to the mock card placeholder + "Complete purchase" button (no network), so no MSW handler needed.
const meta: Meta<typeof BundleCheckoutModal> = {
  title: "Portal/Billing/BundleCheckoutModal",
  component: BundleCheckoutModal,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof BundleCheckoutModal>;

/** Opens on mount so the calculator step is visible without interaction. */
function OpenOnMount({ wallet }: { wallet: typeof subscribedWallet }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ padding: 24 }}>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <BundleCheckoutModal
        open={open}
        wallet={wallet}
        onClose={() => setOpen(false)}
        onComplete={() => setOpen(false)}
      />
    </div>
  );
}

/** First purchase — the "Get 12 months for the price of 10" calculator. */
export const FirstPurchase: Story = {
  render: () => <OpenOnMount wallet={subscribedWallet} />,
};

/** Topping up an existing bundle — same flow, "Top up prepaid capacity" title. */
export const TopUp: Story = {
  render: () => <OpenOnMount wallet={prepaidWallet} />,
};
