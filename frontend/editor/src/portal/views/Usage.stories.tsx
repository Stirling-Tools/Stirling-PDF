import type { Meta, StoryObj } from "@storybook/react-vite";
import { delay, http, HttpResponse } from "msw";
import type { LocalUsage } from "@portal/api/link";
import {
  freeWallet,
  prepaidWallet,
  subscribedWallet,
} from "@portal/components/billing/walletFixtures";
import { Usage } from "@portal/views/Usage";

const WALLET = "/api/v1/payg/wallet";

/** Unsynced work accrued locally since the last daily sync. */
const localUsage: LocalUsage = {
  periodStart: "2026-08-01T00:00:00.000Z",
  apiUnsyncedUnits: 120,
  aiUnsyncedUnits: 34,
  automationUnsyncedUnits: 8,
  totalUnsyncedUnits: 162,
};

/** Handlers for the two calls the view makes: the billed wallet and the
 *  locally-accrued usage that is added on top of it. */
const handlers = (
  wallet: Parameters<typeof HttpResponse.json>[0],
  opts: { walletStatus?: number; local?: LocalUsage | null } = {},
) => [
  http.get(WALLET, () =>
    opts.walletStatus
      ? new HttpResponse(null, { status: opts.walletStatus })
      : HttpResponse.json(wallet),
  ),
  http.get(/\/usage$/, () =>
    HttpResponse.json(opts.local === undefined ? localUsage : opts.local),
  ),
];

/**
 * Usage and billing for the current period. The figure shown is the synced
 * wallet plus locally-accrued units, so it reflects work done since the last
 * daily sync rather than lagging a day behind.
 */
const meta: Meta<typeof Usage> = {
  title: "Portal/Views/Usage",
  component: Usage,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof Usage>;

/** Free team, part-way through its one-time grant. */
export const FreePlan: Story = {
  parameters: { msw: { handlers: handlers(freeWallet) } },
};

/** Subscribed and metered per document. */
export const Subscribed: Story = {
  parameters: { msw: { handlers: handlers(subscribedWallet) } },
};

/** Drawing down a prepaid bundle. */
export const Prepaid: Story = {
  parameters: { msw: { handlers: handlers(prepaidWallet) } },
};

/** Never synced, so there is no local figure to add. */
export const NoLocalUsage: Story = {
  parameters: { msw: { handlers: handlers(freeWallet, { local: null }) } },
};

/** The wallet call is still in flight — skeletons stand in. */
export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get(WALLET, async () => {
          await delay("infinite");
          return HttpResponse.json(freeWallet);
        }),
        http.get(/\/usage$/, () => HttpResponse.json(localUsage)),
      ],
    },
  },
};

/** The wallet could not be loaded. */
export const Error: Story = {
  parameters: {
    msw: { handlers: handlers(freeWallet, { walletStatus: 500 }) },
  },
};

/** An attended SaaS session has lapsed. Self-hosted passes `onReauth` and gets
 *  a sign-in action; SaaS leaves it unset, so the notice shows on its own. */
export const SessionExpired: Story = {
  args: { onReauth: () => {} },
  parameters: {
    msw: { handlers: handlers(freeWallet, { walletStatus: 401 }) },
  },
};

/** The same lapsed session without a re-auth path — notice, no action. */
export const SessionExpiredNoReauth: Story = {
  parameters: {
    msw: { handlers: handlers(freeWallet, { walletStatus: 401 }) },
  },
};
