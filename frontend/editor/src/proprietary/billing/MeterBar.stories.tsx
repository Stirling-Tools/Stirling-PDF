import type { Meta, StoryObj } from "@storybook/react-vite";
import { MeterBar } from "@app/billing/MeterBar";

/**
 * Usage against a cap. The three states are the point: FULL is healthy,
 * WARNED is approaching the cap, DEGRADED is over it — and each maps to a
 * status tone rather than relying on the bar's fill to carry the meaning.
 */
const meta: Meta<typeof MeterBar> = {
  title: "Proprietary/Billing/MeterBar",
  component: MeterBar,
  parameters: { layout: "padded" },
  args: {
    barLabel: "Documents used this period",
    figure: "1,240",
    capSuffix: " of 5,000",
  },
};
export default meta;

type Story = StoryObj<typeof MeterBar>;

/** Comfortably inside the cap. */
export const Full: Story = {
  args: { state: "FULL", pct: 25, statusLabel: "Active" },
};

/** Approaching the cap. */
export const Warned: Story = {
  args: {
    state: "WARNED",
    pct: 86,
    figure: "4,300",
    statusLabel: "Approaching limit",
  },
};

/** Over the cap — processing is degraded until the period rolls or the cap
 *  is raised. */
export const Degraded: Story = {
  args: {
    state: "DEGRADED",
    pct: 100,
    figure: "5,000",
    statusLabel: "Limit reached",
    meta: "Resets on 1 September",
  },
};

/** Nothing used yet. */
export const Empty: Story = {
  args: { state: "FULL", pct: 0, figure: "0" },
};

/** Figure only, no bar — for a plan with no cap to draw against. */
export const NoBar: Story = {
  args: {
    state: "FULL",
    pct: 0,
    figure: "18,402",
    capSuffix: " this period",
    showBar: false,
    statusLabel: "Unlimited",
  },
};

/** With supporting meta beneath. */
export const WithMeta: Story = {
  args: {
    state: "WARNED",
    pct: 72,
    figure: "3,600",
    statusLabel: "Approaching limit",
    meta: "Averaging 240 documents a day",
  },
};
