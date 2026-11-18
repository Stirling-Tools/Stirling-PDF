import type { Meta, StoryObj } from "@storybook/react-vite";
import BookletImpositionAdvancedSettings from "@editor/components/tools/bookletImposition/BookletImpositionAdvancedSettings";
import {
  BookletImpositionParameters,
  defaultParameters,
} from "@editor/hooks/tools/bookletImposition/useBookletImpositionParameters";

const meta = {
  title: "Tools/BookletImposition/BookletImpositionAdvancedSettings",
  component: BookletImpositionAdvancedSettings,
} satisfies Meta<typeof BookletImpositionAdvancedSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

const withGutterParameters: BookletImpositionParameters = {
  ...defaultParameters,
  addGutter: true,
};

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

export const WithGutter: Story = {
  args: {
    parameters: withGutterParameters,
    onParameterChange: () => {},
  },
};

export const ManualDuplex: Story = {
  args: {
    parameters: manualDuplexParameters,
    onParameterChange: () => {},
  },
};
