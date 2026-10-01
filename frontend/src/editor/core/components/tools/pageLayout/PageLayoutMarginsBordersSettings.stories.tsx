import type { Meta, StoryObj } from "@storybook/react-vite";
import PageLayoutMarginsBordersSettings from "@app/components/tools/pageLayout/PageLayoutMarginsBordersSettings";
import {
  PageLayoutParameters,
  defaultParameters,
} from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

const meta = {
  title: "Tools/PageLayout/PageLayoutMarginsBordersSettings",
  component: PageLayoutMarginsBordersSettings,
} satisfies Meta<typeof PageLayoutMarginsBordersSettings>;
export default meta;

type Story = StoryObj<typeof meta>;

const withMarginsParameters: PageLayoutParameters = {
  ...defaultParameters,
  topMargin: 20,
  bottomMargin: 20,
  leftMargin: 15,
  rightMargin: 15,
  innerMargin: 5,
};

const withBorderParameters: PageLayoutParameters = {
  ...defaultParameters,
  addBorder: true,
  borderWidth: 2,
};

export const Default: Story = {
  args: {
    parameters: defaultParameters,
    onParameterChange: () => {},
  },
};

export const WithMargins: Story = {
  args: {
    parameters: withMarginsParameters,
    onParameterChange: () => {},
  },
};

export const WithBorder: Story = {
  args: {
    parameters: withBorderParameters,
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
