import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppSwitch } from "@app/components/shared/AppSwitch";

/** The editor ⇄ processor app switcher rendered by both the editor and portal sidebars. */
const meta: Meta<typeof AppSwitch> = {
  title: "Shared/AppSwitch",
  component: AppSwitch,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Editor: Story = {
  args: {
    current: "editor",
    theme: "light",
    onSwitch: () => {},
  },
};

export const Processor: Story = {
  args: {
    current: "processor",
    theme: "light",
    onSwitch: () => {},
  },
};

export const DarkTheme: Story = {
  args: {
    current: "editor",
    theme: "dark",
    onSwitch: () => {},
  },
};
