import type { Meta, StoryObj } from "@storybook/react-vite";
import { http, HttpResponse, delay } from "msw";
import { ProcessingStatusStrip } from "@portal/components/ProcessingStatusStrip";

const meta: Meta<typeof ProcessingStatusStrip> = {
  title: "Portal/Home/ProcessingStatusStrip",
  component: ProcessingStatusStrip,
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
type Story = StoryObj<typeof ProcessingStatusStrip>;

/** Switch the Tier toolbar to compare the free meter vs the paid plan row. */
export const Default: Story = {};

/** Free tier pushed near its cap so the meter and upgrade nudge turn amber. */
export const FreeNearCap: Story = {
  globals: { tier: "free" },
  parameters: {
    msw: {
      handlers: [
        http.get("/v1/home/kpis", async () => {
          await delay(80);
          return HttpResponse.json([{ value: "472 / 500" }]);
        }),
      ],
    },
  },
};
