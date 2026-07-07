import type { Meta, StoryObj } from "@storybook/react-vite";
import { DealStatusHero } from "@portal/components/procurement/DealStatusHero";
import type { ProcurementSnapshot } from "@portal/api/procurement";

const base: ProcurementSnapshot = {
  dealId: 1,
  stage: "trial",
  trialStartedAt: "2026-06-25T00:00:00Z",
  trialEndsAt: "2026-07-09T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  latestQuote: null,
};

/** The Home deal-status hero across the commercial stages; the CTA expands the takeover modal. */
const meta: Meta<typeof DealStatusHero> = {
  title: "Portal/Procurement/DealStatusHero",
  component: DealStatusHero,
  parameters: { layout: "padded" },
  args: {
    onExpand: () => {},
    onKeyDocs: () => {},
    onInvite: () => {},
    onSchedule: () => {},
    onManageTrial: () => {},
    onNavigate: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof DealStatusHero>;

export const Trial: Story = { args: { snapshot: base } };
export const Quote: Story = {
  args: { snapshot: { ...base, stage: "quote", trialEndsAt: null } },
};
export const Agreement: Story = {
  args: { snapshot: { ...base, stage: "security", trialEndsAt: null } },
};
export const Payment: Story = {
  args: { snapshot: { ...base, stage: "procurement", trialEndsAt: null } },
};
export const Live: Story = {
  args: {
    snapshot: { ...base, stage: "active", licensed: true, trialEndsAt: null },
  },
};
