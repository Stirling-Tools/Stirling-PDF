/**
 * The upgrade-to-Processor flow. Three panels share one frame — set a monthly
 * ceiling, pay, then a short confirmation — and the step is held in local state.
 * Only the first is reachable here: the second mints a Stripe Checkout session
 * through the platform billing seam and the third sits behind it, so neither
 * can be posed from props.
 *
 * On that first panel the per-document rate is what changes the rendering: it
 * drives the live estimate of how many paid PDFs a ceiling buys. The `currency`
 * and `freeLimit` props are only read by the later panels, so they get no
 * stories of their own.
 *
 * The modal portals to the document body, escaping the story canvas, and covers
 * the viewport the way it covers the settings page it opens over.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import UpgradeModal from "@app/components/shared/config/configSections/UpgradeModal";

const meta: Meta<typeof UpgradeModal> = {
  title: "Cloud/UpgradeModal",
  component: UpgradeModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    teamId: 42,
    onClose: () => {},
    onComplete: () => {},
    currency: "USD",
    freeLimit: 500,
    pricePerDocMinor: 2,
    rateCurrency: "usd",
  },
};
export default meta;

type Story = StoryObj<typeof UpgradeModal>;

/** Choosing a ceiling, with the document estimate derived from the known rate. */
export const SetCap: Story = {};

/** No rate resolved for the team yet, so the ceiling stands without an estimate. */
export const WithoutRate: Story = {
  args: { pricePerDocMinor: null, rateCurrency: null },
};
