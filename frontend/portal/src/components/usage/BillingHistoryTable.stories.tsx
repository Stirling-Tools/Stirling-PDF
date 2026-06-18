import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { BillingHistoryTable } from "@portal/components/usage/BillingHistoryTable";
import { buildBillingHistory } from "@portal/mocks/usage";

const meta: Meta<typeof BillingHistoryTable> = {
  title: "Portal/Usage/BillingHistoryTable",
  component: BillingHistoryTable,
};
export default meta;
type Story = StoryObj<typeof BillingHistoryTable>;

// Free: usage tally lines, no charges.
export const Free: Story = { globals: { tier: "free" } };

// Pro: platform fee + metered overage rows across cycles.
export const Pro: Story = { globals: { tier: "pro" } };

// Enterprise: committed draws plus a goodwill credit (negative amount).
export const Enterprise: Story = { globals: { tier: "enterprise" } };

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/billing/history", async () => {
          await delay("infinite");
          return HttpResponse.json(buildBillingHistory("pro"));
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [http.get("/v1/billing/history", () => HttpResponse.json([]))],
    },
  },
};
