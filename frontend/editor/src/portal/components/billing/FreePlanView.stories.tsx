import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { http, HttpResponse } from "msw";
import { BillingScreen } from "@app/billing";
import { FreePlanView } from "@portal/components/billing/FreePlanView";
import { freeWallet } from "@app/billing/walletFixtures";
import "@portal/components/billing/billing.css";

const meta: Meta<typeof FreePlanView> = {
  title: "Portal/Billing/FreePlanView",
  component: FreePlanView,
  parameters: {
    layout: "fullscreen",
    msw: {
      handlers: [
        http.post("*/rest/v1/rpc/payg_get_latest_bundle_quote", () =>
          HttpResponse.json([
            {
              quote_id: 7,
              users: 25,
              posture_policies: 4,
              size_mult: 1.2,
              pipeline_mult: 1,
              pool_credits: 576000,
              price_minor: 480000,
              currency: "usd",
              consented_at: null,
              stripe_quote_id: "qt_preview",
              stripe_quote_number: "QT-0007",
              stripe_ref: null,
              valid_until: "2099-01-01T00:00:00Z",
            },
          ]),
        ),
      ],
    },
  },
};
export default meta;
type Story = StoryObj<typeof FreePlanView>;

function ActivationPreview({ resume = false }: { resume?: boolean }) {
  const [step, setStep] = useState<"choose" | "prepay" | "payg" | null>(
    resume ? "prepay" : null,
  );
  return (
    <BillingScreen
      wallet={freeWallet}
      onActivateProcessor={() => setStep(resume ? "prepay" : "choose")}
      activateLabel={resume ? "View quote" : undefined}
      extras={
        <FreePlanView wallet={freeWallet} step={step} onStepChange={setStep} />
      }
    />
  );
}

export const Leader: Story = { render: () => <ActivationPreview /> };
export const Member: Story = {
  args: { wallet: { ...freeWallet, role: "member" } },
};
export const SavedQuote: Story = { render: () => <ActivationPreview resume /> };
export const SavedQuoteDark: Story = {
  ...SavedQuote,
  globals: { theme: "dark" },
};
