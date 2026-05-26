import type { Meta, StoryObj } from "@storybook/react-vite";
import { Placeholder } from "@portal/views/Placeholder";

const meta: Meta<typeof Placeholder> = {
  title: "Portal/Views/Placeholder",
  component: Placeholder,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof Placeholder>;

export const Sources: Story = {
  args: { view: "sources", phase: "Phase 5 — Sources & Agents" },
};
export const Documents: Story = {
  args: { view: "documents", phase: "Phase 6 — Documents" },
};
export const Infrastructure: Story = {
  args: { view: "infrastructure", phase: "Phase 7 — Infrastructure" },
};
export const Editor: Story = {
  args: { view: "editor", phase: "Phase 8 — Editor" },
};
export const Settings: Story = {
  args: { view: "settings", phase: "Settings — modal overlay" },
};
