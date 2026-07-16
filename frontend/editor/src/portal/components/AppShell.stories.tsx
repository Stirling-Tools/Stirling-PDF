import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "@portal/components/AppShell";

const meta: Meta<typeof AppShell> = {
  title: "Portal/Shell/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof AppShell>;

export const Default: Story = {
  args: {
    children: (
      <div style={{ padding: 24 }}>
        <h1>Main content</h1>
        <p>Whatever the active portal view renders goes here.</p>
      </div>
    ),
  },
};
