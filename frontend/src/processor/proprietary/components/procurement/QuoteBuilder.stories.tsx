import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuoteBuilder } from "@processor/components/procurement/QuoteBuilder";
import "@processor/views/Procurement.css";

/**
 * The enterprise quote builder. The "Review quote" step calls the SaaS backend, answered here by
 * the `procurementSaas` MSW handler, so all four steps (incl. the itemised quote paper) work in
 * Storybook. Click through Volume → Commitment & service → Details → Quote.
 */
const meta: Meta<typeof QuoteBuilder> = {
  title: "Portal/Procurement/QuoteBuilder",
  component: QuoteBuilder,
  parameters: { layout: "padded" },
  args: { deployment: "cloud", onGenerate: () => {} },
};
export default meta;

type Story = StoryObj<typeof QuoteBuilder>;

export const Default: Story = {};

/**
 * A team small enough to price under the Enterprise minimum, details filled: generating explains
 * the minimum and leads to the self-serve plans.
 */
export const BelowMinimum: Story = {
  args: {
    minAnnualMinor: 1_200_000,
    onComparePlans: () => {},
    eulaAlreadyAgreed: true,
    initial: {
      volume: 10_000,
      users: 5,
      intensity: 4,
      sizeMult: 1.4,
      deployment: "cloud",
      termYears: 3,
      serviceLevel: "standard",
      indemnification: false,
      training: false,
      qbr: false,
      businessName: "Northwind",
      contactName: "Dana Lee",
      contactEmail: "dana@northwind.example",
      addressLine1: "1 Main St",
      city: "Springfield",
      region: "IL",
      postalCode: "62701",
    },
  },
};

/** Sizing a small team from scratch: Continue moves on and raises the minimum as it goes. */
export const SmallTeam: Story = {
  args: { seats: 5, minAnnualMinor: 1_200_000, onComparePlans: () => {} },
};

/** Just short of the minimum: Continue offers to top the usage up, or to talk it through. */
export const NearMinimum: Story = {
  args: {
    seats: 95,
    minAnnualMinor: 1_200_000,
    onComparePlans: () => {},
    onScheduleCall: () => {},
  },
};
