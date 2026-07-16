import type { Meta, StoryObj } from "@storybook/react-vite";
import { SidebarChecklistSlot } from "@app/components/shared/SidebarChecklistSlot";

/** Core stub: renders nothing (onboarding checklist is a SaaS-only extension). */
const meta: Meta<typeof SidebarChecklistSlot> = {
  title: "Shared/SidebarChecklistSlot",
  component: SidebarChecklistSlot,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    collapsed: false,
  },
};

export const Collapsed: Story = {
  args: {
    collapsed: true,
  },
};
