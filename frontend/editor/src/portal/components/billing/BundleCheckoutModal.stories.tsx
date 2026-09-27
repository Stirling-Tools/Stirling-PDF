import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { http, HttpResponse } from "msw";
import { Button } from "@app/ui";
import { BundleCheckoutModal } from "@portal/components/billing/BundleCheckoutModal";
import {
  prepaidWallet,
  subscribedWallet,
} from "@portal/components/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof BundleCheckoutModal> = {
  title: "Portal/Billing/BundleCheckoutModal",
  component: BundleCheckoutModal,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.post(
          "http://saas.mock/functions/v1/create-payg-bundle-quote",
          async ({ request }) => {
            const body = (await request.json()) as { preview?: boolean };
            return HttpResponse.json(
              body.preview
                ? {
                    success: true,
                    currency: "usd",
                    unit_amount_minor: 1,
                    available_currencies: ["usd"],
                    currency_locked: false,
                  }
                : {
                    success: true,
                    stripe_quote_id: "qt_story_bundle",
                    stripe_quote_number: "Q-STORY-1",
                  },
            );
          },
        ),
        http.post(
          "http://saas.mock/rest/v1/rpc/payg_get_latest_bundle_quote",
          () => HttpResponse.json([]),
        ),
      ],
    },
  },
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
