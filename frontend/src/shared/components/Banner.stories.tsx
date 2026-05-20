import type { Meta, StoryObj } from "@storybook/react-vite";
import { Banner } from "@shared/components/Banner";
import { Button } from "@shared/components/Button";

const meta: Meta<typeof Banner> = {
  title: "Primitives/Banner",
  component: Banner,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    tone: "info",
    title: "Heads up",
    description: "Storage quota approaching 80%.",
  },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["info", "success", "warning", "danger", "neutral"],
    },
    onDismiss: { action: "dismissed" },
  },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "40rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Banner>;

/** Flip tone / title / description / action / onDismiss in controls. */
export const Playground: Story = {};

export const WithAction: Story = {
  args: {
    tone: "warning",
    title: "Approaching cap",
    description: "389k of 500k docs processed.",
    action: (
      <Button size="sm" variant="outline" accent="amber">
        Upgrade
      </Button>
    ),
  },
};

export const ToneMatrix: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Banner tone="info" title="Info" description="Just so you know." />
      <Banner
        tone="success"
        title="Deployed"
        description="Prior Auth v3.1.0 is live in us-east-1."
      />
      <Banner
        tone="warning"
        title="Schema drift"
        description="12 docs in 1h didn't match — confidence ↓ 0.07."
      />
      <Banner
        tone="danger"
        title="Pipeline run failed"
        description="8% error rate — 14 docs sent to review queue."
      />
    </div>
  ),
};
