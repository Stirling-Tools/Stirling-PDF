import type { Meta, StoryObj } from "@storybook/react-vite";
import BookletImpositionSettings from "@app/components/tools/bookletImposition/BookletImpositionSettings";
import {
  BookletImpositionParameters,
  defaultParameters,
} from "@app/hooks/tools/bookletImposition/useBookletImpositionParameters";

const meta = {
  title: "Tools/BookletImposition/BookletImpositionSettings",
  component: BookletImpositionSettings,
} satisfies Meta<typeof BookletImpositionSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

const manualDuplexParameters: BookletImpositionParameters = {
  ...defaultParameters,
  doubleSided: false,
  duplexPass: "FIRST",
};

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const ManualDuplex: Story = {
  args: {
    parameters: manualDuplexParameters,
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
