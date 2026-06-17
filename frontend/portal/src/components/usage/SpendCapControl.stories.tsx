import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpendCapControl } from "@portal/components/usage/SpendCapControl";
import { buildBillingSummary } from "@portal/mocks/usage";

const meta: Meta<typeof SpendCapControl> = {
  title: "Portal/Usage/SpendCapControl",
  component: SpendCapControl,
  decorators: [
    (S) => (
      <div style={{ maxWidth: "28rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SpendCapControl>;

// Free can't accrue spend — explanatory card, no slider.
export const Free: Story = {
  args: { summary: buildBillingSummary("free") },
  globals: { tier: "free" },
};

// Pro with a cap already set — interactive slider + projection meter.
export const ProCapEnabled: Story = {
  args: { summary: buildBillingSummary("pro") },
  globals: { tier: "pro" },
};

// Pro with no cap set — starts collapsed behind "Enable cap".
export const ProCapDisabled: Story = {
  args: { summary: { ...buildBillingSummary("pro"), spendCap: null } },
  globals: { tier: "pro" },
};

// Enterprise spend is contract-governed — read-only card.
export const Enterprise: Story = {
  args: { summary: buildBillingSummary("enterprise") },
  globals: { tier: "enterprise" },
};
