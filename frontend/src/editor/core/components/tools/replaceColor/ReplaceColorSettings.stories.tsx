import type { Meta, StoryObj } from "@storybook/react-vite";
import ReplaceColorSettings from "@app/components/tools/replaceColor/ReplaceColorSettings";
import {
  ReplaceColorParameters,
  defaultParameters,
} from "@app/hooks/tools/replaceColor/useReplaceColorParameters";

const meta = {
  title: "Tools/ReplaceColor/ReplaceColorSettings",
  component: ReplaceColorSettings,
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
} satisfies Meta<typeof ReplaceColorSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomColor: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      replaceAndInvertOption: "CUSTOM_COLOR",
    } satisfies ReplaceColorParameters,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
