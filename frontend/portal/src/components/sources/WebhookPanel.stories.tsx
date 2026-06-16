import type { Meta, StoryObj } from "@storybook/react-vite";
import type { WebhookDetail } from "@portal/api/sources";
import { WebhookPanel } from "@portal/components/sources/WebhookPanel";

const meta: Meta<typeof WebhookPanel> = {
  title: "Portal/Sources/WebhookPanel",
  component: WebhookPanel,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "48rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof WebhookPanel>;

const healthy: WebhookDetail = {
  kind: "webhook",
  url: "https://hooks.acme.com/stirling/ingest",
  authType: "HMAC-SHA256",
  successRate: 0.991,
  retries24h: 3,
  recentDeliveries: [
    { event: "document.processed", status: 200, time: "9m ago" },
    { event: "pipeline.completed", status: 200, time: "22m ago" },
    { event: "document.processed", status: 503, time: "1h ago" },
  ],
};

export const Healthy: Story = { args: { d: healthy } };

/** Below the 95% floor: success badge goes danger, retries spike, 5xx deliveries. */
export const Failing: Story = {
  args: {
    d: {
      ...healthy,
      url: "https://erp.acme.com/inbound/stirling",
      authType: "Basic",
      successRate: 0.72,
      retries24h: 58,
      recentDeliveries: [
        { event: "document.processed", status: 502, time: "2m ago" },
        { event: "document.processed", status: 502, time: "5m ago" },
        { event: "pipeline.completed", status: 200, time: "9m ago" },
      ],
    },
  },
};
