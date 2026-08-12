/**
 * The deal-status hero as Home actually mounts it: bound to the shared
 * procurement controller rather than to loose props.
 *
 * The controller decides three things here. Its snapshot is the deal being
 * shown — no snapshot and the hero does not render at all, so that is not a
 * state to look at. Its `busy` flag puts the primary action into its loading
 * form while a request is in flight. And `isLinked` gates scheduling a call,
 * since booking runs through the linked account, so an unlinked org loses that
 * icon action.
 *
 * The wrapper's own decision is where the primary action leads: an exploring
 * deal has no journey to open yet, so its action starts trial setup instead of
 * expanding the flow.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ControlledDealStatusHero } from "@portal/components/procurement/ProcurementBanner";
import type { ProcurementController } from "@portal/components/procurement/useProcurement";
import type { ProcurementSnapshot } from "@portal/api/procurement";

const snapshot: ProcurementSnapshot = {
  dealId: 1,
  stage: "trial",
  deployment: "cloud",
  seats: 250,
  trialStartedAt: "2026-06-25T00:00:00Z",
  trialEndsAt: "2026-07-09T00:00:00Z",
  trialExtensionsUsed: 0,
  licensed: false,
  licenseKey: null,
  businessName: "Northwind Logistics",
  contactName: null,
  contactEmail: null,
  agreementSignedVersion: null,
  latestQuote: null,
};

/** Only the fields the hero and its wiring read; the rest of the controller is unused here. */
function controller(
  overrides: Partial<ProcurementController> = {},
): ProcurementController {
  return {
    data: snapshot,
    stage: snapshot.stage,
    busy: false,
    isLinked: true,
    setOpen: () => {},
    setExtra: () => {},
    onStartTrial: () => {},
    onAcceptQuote: async () => {},
    ...overrides,
  } as unknown as ProcurementController;
}

const meta: Meta<typeof ControlledDealStatusHero> = {
  title: "Portal/Procurement/ControlledDealStatusHero",
  component: ControlledDealStatusHero,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof ControlledDealStatusHero>;

/** A trial under way on a linked org — every icon action available. */
export const ActiveTrial: Story = { args: { controller: controller() } };

/**
 * Interest recorded but no trial started: the deal sits on the trial rung with
 * setting the trial up as its ask.
 */
export const Exploring: Story = {
  args: {
    controller: controller({
      data: { ...snapshot, stage: "exploring", trialEndsAt: null },
      stage: "exploring",
    }),
  },
};

/** A request in flight — the primary action shows its loading state. */
export const Busy: Story = {
  args: { controller: controller({ busy: true }) },
};

/** No linked account, so there is no email to prefill and scheduling drops out. */
export const Unlinked: Story = {
  args: { controller: controller({ isLinked: false }) },
};
