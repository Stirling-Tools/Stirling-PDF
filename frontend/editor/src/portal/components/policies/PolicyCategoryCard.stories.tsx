import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  decorateForStory,
} from "@portal/components/policies/storyFixtures";
import { PolicyCategoryCard } from "@portal/components/policies/PolicyCategoryCard";

const security = POLICY_CATEGORIES.find((c) => c.id === "security")!;
const compliance = POLICY_CATEGORIES.find((c) => c.id === "compliance")!;

const meta: Meta<typeof PolicyCategoryCard> = {
  title: "Portal/Policies/PolicyCategoryCard",
  component: PolicyCategoryCard,
  parameters: { layout: "padded" },
  args: { onOpen: () => {} },
};
export default meta;
type Story = StoryObj<typeof PolicyCategoryCard>;

/** A configured, active policy — shows live stats. */
export const Configured: Story = {
  args: {
    entry: {
      category: security,
      config: POLICY_CONFIG.security,
      policy: decorateForStory("security"),
    },
  },
};

/** Not yet set up — shows the rule chips + "Set up" affordance. */
export const NotSetUp: Story = {
  args: {
    entry: { category: security, config: POLICY_CONFIG.security, policy: null },
  },
};

/** Coming-soon category — locked and inert. */
export const ComingSoon: Story = {
  args: {
    entry: {
      category: compliance,
      config: POLICY_CONFIG.compliance,
      policy: null,
    },
  },
};
