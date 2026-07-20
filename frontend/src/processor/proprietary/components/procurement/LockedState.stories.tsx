import type { Meta, StoryObj } from "@storybook/react-vite";
import { LockedState } from "@processor/components/procurement/LockedState";
import { JOURNEY } from "@processor/api/procurement";
import "@processor/views/Procurement.css";

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
