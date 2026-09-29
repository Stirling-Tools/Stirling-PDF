import type { Meta, StoryObj } from "@storybook/react-vite";
import SplitAutomationSettings from "@app/components/tools/split/SplitAutomationSettings";
import {
  defaultParameters,
  SplitParameters,
} from "@app/hooks/tools/split/useSplitParameters";
import { SPLIT_METHODS } from "@app/constants/splitConstants";

const meta = {
  title: "Tools/Split/SplitAutomationSettings",
  component: SplitAutomationSettings,
} satisfies Meta<typeof SplitAutomationSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const MethodSelected: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      method: SPLIT_METHODS.BY_PAGES,
      pages: "1,3,5",
    } satisfies SplitParameters,
    onParameterChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      method: SPLIT_METHODS.BY_PAGES,
      pages: "1,3,5",
    } satisfies SplitParameters,
    onParameterChange: () => {},
    disabled: true,
  },
};
