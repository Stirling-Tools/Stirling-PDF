import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { Home } from "@portal/views/Home";

const meta: Meta<typeof Home> = {
  title: "Portal/Views/Home",
  component: Home,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof Home>;

export const ProTier: Story = { globals: { tier: "pro" } };
export const FreeTier: Story = { globals: { tier: "free" } };
export const EnterpriseTier: Story = { globals: { tier: "enterprise" } };

/**
 * A subscribed org with a procurement deal underway: the deal-status hero
 * replaces the setup checklist as the editor hero's footer (procurement is a
 * bolt-on to any tier). Seeds an active trial snapshot on the SaaS mock.
 */
export const SubscribedInProcurement: Story = {
  globals: { tier: "pro" },
  parameters: {
    msw: {
      handlers: [
        http.get("http://saas.mock/api/v1/procurement", () =>
          HttpResponse.json({
            dealId: 1,
            stage: "trial",
            deployment: "cloud",
            seats: 250,
            trialStartedAt: "2026-07-01T00:00:00.000Z",
            trialEndsAt: "2026-07-21T00:00:00.000Z",
            trialExtensionsUsed: 0,
            licensed: true,
            latestQuote: null,
          }),
        ),
      ],
    },
  },
};

export const SlowUsage: Story = {
  globals: { tier: "pro" },
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/analytics/usage", async () => {
          await delay(3000);
          return HttpResponse.json({ points: [], priorTotal: 0 });
        }),
      ],
    },
  },
};
