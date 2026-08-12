/**
 * The always-mounted host for the two usage-limit warnings. It takes no props
 * and shows nothing of its own: which modal appears is decided by whichever
 * imperative opener the app calls, so each story calls one on mount. The
 * server-side run paths reach these same two modals through a third event,
 * picking between them on the caller's subscription state, so they add no
 * appearance of their own.
 *
 * Each modal holds itself back until the wallet resolves and then reads its
 * headline and meter from it — hence the mocked wallet behind every story.
 *
 * Mantine renders the modals into a portal outside the story canvas.
 */
import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse } from "msw";
import UsageLimitModalHost from "@app/components/UsageLimitModalHost";
import {
  openFreeLimitModal,
  openSpendCapModal,
} from "@app/components/usageLimitModals";
import type { Wallet } from "@app/billing";

/** A team that has just spent the last of its one-time free grant. */
const EXHAUSTED_FREE_WALLET: Wallet = {
  teamId: 42,
  status: "free",
  role: "leader",
  billingPeriodStart: "2025-03-01",
  billingPeriodEnd: "2025-03-31",
  billableUsed: 500,
  billableLimit: 500,
  freeAllowance: 500,
  freeRemaining: 0,
  pricePerDocMinor: 2,
  bundleRatePerCreditMinor: null,
  currency: "usd",
  estimatedBillMinor: 0,
  capUsd: null,
  noCap: false,
  stripeSubscriptionId: null,
  spendUnitsThisPeriod: 500,
  categoryBreakdown: { api: 120, ai: 240, automation: 140 },
  categoryDocs: { api: 120, ai: 240, automation: 140 },
  docsProcessedThisPeriod: 500,
  uniquePdfsThisPeriod: 480,
  sizeMultiplierPdfsThisPeriod: 12,
  billingMode: "payg",
  prepaidUnitsRemaining: 0,
  prepaidUnitsTotal: 0,
  prepaidExpiresAt: null,
  members: [],
  recent: [],
};

/** A subscribed team whose spend has run into its own monthly ceiling. */
const CAPPED_WALLET: Wallet = {
  ...EXHAUSTED_FREE_WALLET,
  status: "subscribed",
  billableLimit: null,
  estimatedBillMinor: 5000,
  capUsd: 50,
  stripeSubscriptionId: "sub_storybook",
};

function walletHandler(wallet: Wallet) {
  return [http.get("*/api/v1/payg/wallet", () => HttpResponse.json(wallet))];
}

/** Stands in for the app code that hits a limit and calls an opener. */
function Trigger({ open }: { open: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(open, 0);
    return () => window.clearTimeout(id);
  }, [open]);
  return <UsageLimitModalHost />;
}

const meta: Meta<typeof UsageLimitModalHost> = {
  title: "Cloud/UsageLimitModalHost",
  component: UsageLimitModalHost,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof UsageLimitModalHost>;

/** The free grant is spent, so the upgrade invitation appears. */
export const FreeLimitReached: Story = {
  parameters: { msw: { handlers: walletHandler(EXHAUSTED_FREE_WALLET) } },
  render: () => <Trigger open={openFreeLimitModal} />,
};

/** A subscribed team at its monthly ceiling, invited to raise it instead. */
export const SpendCapReached: Story = {
  parameters: { msw: { handlers: walletHandler(CAPPED_WALLET) } },
  render: () => <Trigger open={openSpendCapModal} />,
};
