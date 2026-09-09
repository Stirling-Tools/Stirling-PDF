import type { Meta, StoryObj } from "@storybook/react-vite";
import { DealJourney } from "@portal/components/procurement/DealJourney";
import { buildProcurement } from "@portal/mocks/procurement";
import type { Deal } from "@portal/api/procurement";
import "@portal/views/Procurement.css";

const data = buildProcurement("enterprise");
const deal = data.deal as Deal;

const meta: Meta<typeof DealJourney> = {
  title: "Portal/Procurement/DealJourney",
  component: DealJourney,
  parameters: { layout: "padded" },
  args: { deal, journey: data.journey, onAdvance: () => {} },
};
export default meta;
type Story = StoryObj<typeof DealJourney>;

// Mid-journey at the Agreement stage, the seeded deal state.
export const Default: Story = {};

// Evaluating: the trial strip shows runway + key; next step builds the quote.
export const AtTrial: Story = {
  args: { deal: { ...deal, currentStage: "trial" } },
};

// Terminal stage, provisioning, no further CTA.
export const Live: Story = {
  args: { deal: { ...deal, currentStage: "active" } },
};
