import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppSwitcher } from "@app/components/shared/AppSwitcher";

/**
 * The sidebar brand header. Core has no admin portal to switch to, so this is
 * just the logo — builds that bundle the portal shadow this file with a version
 * whose logo doubles as the editor⇄processor switcher. Both states matter here
 * because the rail collapses.
 */
const meta: Meta<typeof AppSwitcher> = {
  title: "Shared/AppSwitcher",
  component: AppSwitcher,
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj<typeof AppSwitcher>;

/** Expanded rail — mark and wordmark. */
export const Expanded: Story = {};

/** Collapsed rail — icon only. */
export const Collapsed: Story = { args: { collapsed: true } };

/** Both, to compare the mark's optical size between the two rail widths. */
export const BothStates: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "3rem", alignItems: "center" }}>
      <AppSwitcher />
      <AppSwitcher collapsed />
    </div>
  ),
};
