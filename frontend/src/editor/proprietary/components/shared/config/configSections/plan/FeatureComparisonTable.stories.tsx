import type { Meta, StoryObj } from "@storybook/react-vite";
import FeatureComparisonTable from "@app/components/shared/config/configSections/plan/FeatureComparisonTable";
import type { PlanFeature } from "@app/types/license";

const features: PlanFeature[] = [
  { name: "PDF merge & split", included: true },
  { name: "OCR", included: true },
  { name: "Custom watermarking", included: true },
  { name: "Priority support", included: false },
];

const plans = [
  {
    name: "Free",
    tier: "free",
    features: features.map((f, i) => ({ ...f, included: i < 2 })),
  },
  {
    name: "Server",
    tier: "server",
    popular: true,
    features: features.map((f, i) => ({ ...f, included: i < 3 })),
  },
  {
    name: "Enterprise",
    tier: "enterprise",
    features: features.map((f) => ({ ...f, included: true })),
  },
];

/**
 * Table comparing feature availability across plan tiers.
 */
const meta: Meta<typeof FeatureComparisonTable> = {
  title: "Config/Plan/FeatureComparisonTable",
  component: FeatureComparisonTable,
  parameters: { layout: "padded" },
  args: {
    plans,
    currentTier: "free",
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** When the current tier is enterprise, the "Popular" badge is suppressed on the Server plan. */
export const CurrentTierEnterprise: Story = {
  args: { currentTier: "enterprise" },
};
