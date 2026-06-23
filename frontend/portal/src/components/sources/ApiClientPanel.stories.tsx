import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ApiClientDetail } from "@portal/api/sources";
import { ApiClientPanel } from "@portal/components/sources/ApiClientPanel";

const meta: Meta<typeof ApiClientPanel> = {
  title: "Portal/Sources/ApiClientPanel",
  component: ApiClientPanel,
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
type Story = StoryObj<typeof ApiClientPanel>;

const active: ApiClientDetail = {
  kind: "apiclient",
  maskedKey: "sk_live_••••••••••••4f9a",
  rateLimit: "600 req/min",
  rateUsedPct: 0.42,
  endpoints: [
    { method: "POST", path: "/v1/extract", calls24h: 1820 },
    { method: "POST", path: "/v1/redact", calls24h: 740 },
    { method: "GET", path: "/v1/documents/{id}", calls24h: 380 },
  ],
  createdBy: "you@acme.com",
  lastRotated: "23 days ago",
};

export const Active: Story = { args: { d: active } };

/** Rate window near its ceiling pushes the thresholded bar into the warning band. */
export const NearLimit: Story = {
  args: { d: { ...active, rateUsedPct: 0.93 } },
};

/** A revoked key: never rotated, no traffic, masked label flags the state. */
export const Revoked: Story = {
  args: {
    d: {
      ...active,
      maskedKey: "sk_live_••••••••••••0000 (revoked)",
      rateUsedPct: 0,
      lastRotated: "never",
      endpoints: active.endpoints.map((e) => ({ ...e, calls24h: 0 })),
    },
  },
};
