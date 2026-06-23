import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { UsageChart } from "@portal/components/usage/UsageChart";
import { buildUsagePayload } from "@portal/mocks/usage";

const meta: Meta<typeof UsageChart> = {
  title: "Portal/Usage/UsageChart",
  component: UsageChart,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "60rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof UsageChart>;

export const Default: Story = {};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/billing/usage", async () => {
          await delay("infinite");
          return HttpResponse.json(buildUsagePayload());
        }),
      ],
    },
  },
};

export const Empty: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/billing/usage", () =>
          HttpResponse.json({ points: [], priorTotal: 0 }),
        ),
      ],
    },
  },
};
