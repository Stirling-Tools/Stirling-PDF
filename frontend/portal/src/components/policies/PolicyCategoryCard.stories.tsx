import type { Meta, StoryObj } from "@storybook/react-vite";
import { categoriesFor } from "@portal/mocks/policies";
import { PolicyCategoryCard } from "@portal/components/policies/PolicyCategoryCard";

const PRO = categoriesFor("pro");
const SECURITY = PRO.find((c) => c.category === "security")!;
const COMPLIANCE = PRO.find((c) => c.category === "compliance")!;

const meta: Meta<typeof PolicyCategoryCard> = {
  title: "Portal/Policies/PolicyCategoryCard",
  component: PolicyCategoryCard,
  parameters: { layout: "padded" },
  args: { config: SECURITY, editable: true, onOpen: () => {} },
};
export default meta;
type Story = StoryObj<typeof PolicyCategoryCard>;

export const Editable: Story = {};

/** Tier below the category's requirement — inert, with an upgrade nudge. */
export const Locked: Story = {
  args: { config: COMPLIANCE, editable: false },
};
