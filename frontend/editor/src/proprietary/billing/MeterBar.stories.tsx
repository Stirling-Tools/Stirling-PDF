import type { Meta, StoryObj } from "@storybook/react-vite";
import { MeterBar } from "@app/billing";
import "@portal/components/billing/billing.css";

/**
 * The usage-meter block shared by the editor's cloud surface and the admin
 * portal. Everything visible is a prop: the caller owns the copy, and `state`
 * (FULL / WARNED / DEGRADED) drives the status-chip tone and the fill colour
 * together — the percentage alone never changes the palette. Two parts are
 * optional and are what separates most of these states: the status chip
 * (hidden when no label is given) and the fill bar (hidden when a plan has no
 * ceiling to measure against).
 *
 * The `paygf-meter` styling belongs to each host app rather than the component,
 * so these render against the portal's billing stylesheet — the same one the
 * wallet, spend-limit and prepaid cards are seen under.
 */
const meta: Meta<typeof MeterBar> = {
  title: "Portal/Billing/MeterBar",
  component: MeterBar,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "34rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof MeterBar>;

/** Comfortably inside the free grant — green chip, green fill. */
export const Healthy: Story = {
  args: {
    state: "FULL",
    pct: 24,
    figure: "120",
    capSuffix: "/ 500 free PDFs",
    statusLabel: "Healthy",
    meta: "Resets 1 July",
    barLabel: "Free allowance",
  },
};

/** Near the ceiling — amber chip and fill warn before anything is blocked. */
export const Approaching: Story = {
  args: {
    state: "WARNED",
    pct: 86,
    figure: "$860",
    capSuffix: "/ $1,000 cap",
    statusLabel: "Approaching cap",
    meta: "Projected $1,020 by 30 June",
    barLabel: "Spend limit",
  },
};

/** At the ceiling — red chip and fill; billable work is refused past this point. */
export const CapReached: Story = {
  args: {
    state: "DEGRADED",
    pct: 100,
    figure: "$1,000",
    capSuffix: "/ $1,000 cap",
    statusLabel: "Cap reached",
    meta: "Raise the cap to resume processing",
    barLabel: "Spend limit",
  },
};

/**
 * No ceiling to fill against, so the bar is dropped and the figure carries the
 * whole meter. The chip is omitted too — there is no threshold to be near.
 */
export const Uncapped: Story = {
  args: {
    state: "FULL",
    pct: 0,
    figure: "$1,430",
    capSuffix: "no cap",
    showBar: false,
    meta: "Billed monthly in arrears",
    barLabel: "Spend this period",
  },
};
