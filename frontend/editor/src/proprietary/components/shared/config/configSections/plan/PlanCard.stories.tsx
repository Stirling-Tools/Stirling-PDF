import type { Meta, StoryObj } from "@storybook/react-vite";
import PlanCard from "@app/components/shared/config/configSections/plan/PlanCard";
import type { PlanTierGroup } from "@app/services/licenseService";

const freePlanGroup: PlanTierGroup = {
  tier: "free",
  name: "Free",
  monthly: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "$",
    period: "month",
    features: [],
    highlights: ["Basic PDF tools", "Community support"],
    lookupKey: "selfhosted:free",
  },
  yearly: null,
  features: [],
  highlights: ["Basic PDF tools", "Community support"],
  popular: false,
};

const serverPlanGroup: PlanTierGroup = {
  tier: "server",
  name: "Server",
  monthly: {
    id: "server-monthly",
    name: "Server",
    price: 29,
    currency: "$",
    period: "month",
    features: [],
    highlights: ["Unlimited users", "Priority support", "SSO"],
    lookupKey: "selfhosted:server:monthly",
  },
  yearly: {
    id: "server-yearly",
    name: "Server",
    price: 290,
    currency: "$",
    period: "year",
    features: [],
    highlights: ["Unlimited users", "Priority support", "SSO"],
    lookupKey: "selfhosted:server:yearly",
  },
  features: [],
  highlights: ["Unlimited users", "Priority support", "SSO"],
  popular: true,
};

const enterprisePlanGroup: PlanTierGroup = {
  tier: "enterprise",
  name: "Enterprise",
  monthly: {
    id: "enterprise-monthly",
    name: "Enterprise",
    price: 0,
    currency: "$",
    period: "month",
    seatPrice: 12,
    requiresSeats: true,
    features: [],
    highlights: ["Dedicated support", "Custom SLAs", "Advanced security"],
    lookupKey: "selfhosted:enterprise:monthly",
  },
  yearly: {
    id: "enterprise-yearly",
    name: "Enterprise",
    price: 0,
    currency: "$",
    period: "year",
    seatPrice: 120,
    requiresSeats: true,
    features: [],
    highlights: ["Dedicated support", "Custom SLAs", "Advanced security"],
    lookupKey: "selfhosted:enterprise:yearly",
  },
  features: [],
  highlights: ["Dedicated support", "Custom SLAs", "Advanced security"],
  popular: false,
};

const meta = {
  title: "Config/Plan/PlanCard",
  component: PlanCard,
  parameters: { layout: "padded" },
  args: {
    planGroup: serverPlanGroup,
    isCurrentTier: false,
    isDowngrade: false,
    onUpgradeClick: () => {},
  },
} satisfies Meta<typeof PlanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Free tier plan, shown as a permanently-included option. */
export const FreePlan: Story = {
  args: {
    planGroup: freePlanGroup,
  },
};

/** Enterprise tier, priced per-seat and blocked until the Server plan is active. */
export const EnterprisePlan: Story = {
  args: {
    planGroup: enterprisePlanGroup,
    currentTier: "free",
  },
};

/** The plan the user already owns, showing the "Manage" action and seat count. */
export const CurrentTier: Story = {
  args: {
    planGroup: serverPlanGroup,
    isCurrentTier: true,
    currentTier: "server",
    currentLicenseInfo: {
      licenseType: "SERVER",
      enabled: true,
      maxUsers: 25,
      hasKey: true,
    },
    onManageClick: () => {},
  },
};
