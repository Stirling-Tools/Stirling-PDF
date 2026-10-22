import type { Meta, StoryObj } from "@storybook/react-vite";
import LayoutPreview from "@app/components/tools/pageLayout/LayoutPreview";
import { defaultParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

const meta = {
  title: "Tools/PageLayout/LayoutPreview",
  component: LayoutPreview,
} satisfies Meta<typeof LayoutPreview>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
  },
};

export const CustomGridLandscape: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      mode: "CUSTOM",
      rows: 2,
      cols: 3,
      orientation: "LANDSCAPE",
      addBorder: true,
    },
  },
};

export const RightToLeftReading: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      mode: "CUSTOM",
      rows: 2,
      cols: 2,
      arrangement: "BY_ROWS",
      readingDirection: "RTL",
      addBorder: true,
    },
  },
};
