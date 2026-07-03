import type { Meta, StoryObj } from "@storybook/react-vite";
import { DocRow } from "@portal/components/procurement/DocRow";
import type { LedgerDoc } from "@portal/api/procurement";
import "@portal/views/Procurement.css";

const meta: Meta<typeof DocRow> = {
  title: "Portal/Procurement/DocRow",
  component: DocRow,
  parameters: { layout: "padded" },
  args: { onAction: () => {} },
};
export default meta;
type Story = StoryObj<typeof DocRow>;

const sign: LedgerDoc = {
  id: "d1",
  name: "Stirling Enterprise Agreement",
  sub: "One signature: MSA + order form + EULA + DPA.",
  status: "action",
  action: "sign",
};

const download: LedgerDoc = {
  id: "d2",
  name: "SOC 2 Type II report",
  sub: "Independent audit of our security controls.",
  status: "available",
  action: "download",
};

const paidAddon: LedgerDoc = {
  id: "d3",
  name: "Onboarding & training",
  sub: "Guided rollout and live training for your team.",
  status: "request",
  action: "request",
  optional: true,
  fee: 7_500,
};

const done: LedgerDoc = {
  id: "d4",
  name: "Formal quote",
  sub: "Committed-volume pricing, term and line items.",
  status: "complete",
  action: "download",
};

// Deal-advancing action, filled purple CTA.
export const SignAction: Story = { args: { doc: sign } };

// Quiet outline action for a ready download.
export const Download: Story = { args: { doc: download } };

// Optional paid add-on, chips flag it and the fee folds into the CTA.
export const PaidAddon: Story = { args: { doc: paidAddon } };

// Completed paperwork keeps a record but offers no further action.
export const Complete: Story = { args: { doc: done } };

// A row in a future, not-yet-reached stage, dimmed, marked "Upcoming", inert.
export const Locked: Story = { args: { doc: sign, locked: true } };
