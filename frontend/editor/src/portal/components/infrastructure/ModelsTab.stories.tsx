import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModelsTab } from "@portal/components/infrastructure/ModelsTab";
import "@portal/views/Infrastructure.css";

// Data is served by the registered MSW infrastructure handler; the tier global
// (toolbar) drives which catalogue + routing slice each story renders.
const meta = {
  title: "Infrastructure/ModelsTab",
  component: ModelsTab,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ModelsTab>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Pro: full managed catalogue plus routing control. */
export const Pro: Story = {
  globals: { tier: "pro" },
};

/** Free: two managed models, no routing (upgrade nudge). */
export const Free: Story = {
  globals: { tier: "free" },
};

/** Enterprise: adds bring-your-own / on-prem models and per-region pinning. */
export const Enterprise: Story = {
  globals: { tier: "enterprise" },
};
