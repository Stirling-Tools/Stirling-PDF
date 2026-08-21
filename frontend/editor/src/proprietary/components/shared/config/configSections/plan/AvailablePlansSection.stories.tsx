import type { Meta, StoryObj } from "@storybook/react-vite";
import AvailablePlansSection from "@app/components/shared/config/configSections/plan/AvailablePlansSection";
import type { PlanTier } from "@app/services/licenseService";

const FEATURES = [
  { name: "PDF conversion", included: true },
  { name: "Digital signatures", included: true },
  { name: "SSO", included: false },
];

const PLANS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    currency: "$",
    period: "month",
    features: FEATURES,
    highlights: ["Core PDF tools", "Single user"],
    lookupKey: "free",
  },
  {
    id: "selfhosted:server:monthly",
    name: "Server",
    price: 29,
    currency: "$",
    period: "month",
    popular: true,
    features: FEATURES,
    highlights: ["Everything in Free", "Team workspaces", "Priority support"],
    lookupKey: "selfhosted:server:monthly",
  },
  {
    id: "selfhosted:enterprise:monthly",
    name: "Enterprise",
    price: 99,
    currency: "$",
    period: "month",
    seatPrice: 12,
    requiresSeats: true,
    features: FEATURES,
    highlights: ["Everything in Server", "SSO", "Dedicated support"],
    lookupKey: "selfhosted:enterprise:monthly",
  },
];

const meta = {
  title: "Config/Plan/AvailablePlansSection",
  component: AvailablePlansSection,
  parameters: { layout: "padded" },
  args: {
    plans: PLANS,
    onUpgradeClick: () => {},
  },
} satisfies Meta<typeof AvailablePlansSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Adds the currency selector shown when currency props are supplied. */
export const WithCurrencySelector: Story = {
  args: {
    currency: "usd",
    onCurrencyChange: () => {},
    currencyOptions: [
      { value: "usd", label: "USD ($)" },
      { value: "eur", label: "EUR (€)" },
      { value: "gbp", label: "GBP (£)" },
    ],
  },
};

/** Logged-out visitors see disabled upgrade/manage controls. */
export const LoginDisabled: Story = {
  args: {
    loginEnabled: false,
  },
};
