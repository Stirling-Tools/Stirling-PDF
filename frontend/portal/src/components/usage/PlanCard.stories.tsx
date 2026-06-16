import type { Meta, StoryObj } from "@storybook/react-vite";
import { PlanCard } from "@portal/components/usage/PlanCard";
import { PLAN_OPTIONS } from "@portal/mocks/usage";

const [free, pro, enterprise] = PLAN_OPTIONS;

const meta: Meta<typeof PlanCard> = {
  title: "Portal/Usage/PlanCard",
  component: PlanCard,
  args: { onSelect: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "20rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof PlanCard>;

export const Free: Story = { args: { plan: free, isCurrent: false } };

export const Pro: Story = { args: { plan: pro, isCurrent: false } };

export const Enterprise: Story = {
  args: { plan: enterprise, isCurrent: false },
};

// The active plan is outlined and its CTA disabled.
export const Current: Story = { args: { plan: pro, isCurrent: true } };
