import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CatalogueEntry } from "@portal/api/policies";
import { PolicyCatalogueTable } from "@portal/components/policies/PolicyCatalogueTable";
import {
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  decorateForStory,
} from "@portal/components/policies/storyFixtures";
import "@portal/views/Policies.css";

/** Every catalogue category, the first two configured. */
const entries: CatalogueEntry[] = POLICY_CATEGORIES.map((category, i) => ({
  category,
  config: POLICY_CONFIG[category.id],
  policy: i < 2 ? decorateForStory(category.id) : null,
}));

/** The policy catalogue as a data table — Policy / Enforces / Applies to /
 *  Docs / Status — built on the same Table primitive as the Sources and
 *  Documents lists. */
const meta: Meta<typeof PolicyCatalogueTable> = {
  title: "Portal/Policies/PolicyCatalogueTable",
  component: PolicyCatalogueTable,
  parameters: { layout: "padded" },
  args: { onOpen: () => {} },
};
export default meta;

type Story = StoryObj<typeof PolicyCatalogueTable>;

/** A mix of configured and not-yet-set-up rows. */
export const Default: Story = {
  args: { entries },
};

/** Every policy configured and running. */
export const AllConfigured: Story = {
  args: {
    entries: POLICY_CATEGORIES.map((category) => ({
      category,
      config: POLICY_CONFIG[category.id],
      policy: decorateForStory(category.id),
    })),
  },
};

/** Nothing set up yet — every row offers setup. */
export const NoneConfigured: Story = {
  args: {
    entries: POLICY_CATEGORIES.map((category) => ({
      category,
      config: POLICY_CONFIG[category.id],
      policy: null,
    })),
  },
};

/** Setup unavailable for the classification policies: the rows still list, but
 *  carry the reason chip instead of an open affordance. */
export const SomeLocked: Story = {
  args: {
    entries,
    isLocked: (entry) => entry.category.id === "classification",
    lockedLabel: "Requires AI engine",
  },
};

/** Nothing to list. */
export const Empty: Story = {
  args: { entries: [] },
};
