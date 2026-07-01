import type { Meta, StoryObj } from "@storybook/react-vite";
import { LockedState } from "@portal/components/procurement/LockedState";
import { JOURNEY } from "@portal/mocks/procurement";
import "@portal/views/Procurement.css";

const meta: Meta<typeof LockedState> = {
  title: "Portal/Procurement/LockedState",
  component: LockedState,
  parameters: { layout: "padded" },
  args: { onTalkToSales: () => {} },
};
export default meta;
type Story = StoryObj<typeof LockedState>;

// Shown to free/pro buyers, the journey preview behind the upgrade prompt.
export const Default: Story = {
  args: { journey: JOURNEY },
};
