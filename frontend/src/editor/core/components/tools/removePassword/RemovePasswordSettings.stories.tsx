import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import RemovePasswordSettings from "@app/components/tools/removePassword/RemovePasswordSettings";
import { RemovePasswordParameters } from "@app/hooks/tools/removePassword/useRemovePasswordParameters";

const parameters: RemovePasswordParameters = {
  password: "",
};

const meta = {
  title: "Tools/RemovePassword/RemovePasswordSettings",
  component: RemovePasswordSettings,
  parameters: { layout: "padded" },
  args: {
    parameters,
    onParameterChange: fn(),
  },
} satisfies Meta<typeof RemovePasswordSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Filled: Story = {
  args: {
    parameters: {
      ...parameters,
      password: "correct-horse-battery-staple",
    },
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
