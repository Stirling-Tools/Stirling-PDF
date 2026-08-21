import type { Meta, StoryObj } from "@storybook/react-vite";
import PageLayoutPreview from "@app/components/tools/pageLayout/PageLayoutPreview";
import { defaultParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

const meta = {
  title: "Tools/PageLayout/PageLayoutPreview",
  component: PageLayoutPreview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PageLayoutPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    parameters: defaultParameters,
  },
};

export const CustomGridWithBorder: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      mode: "CUSTOM",
      rows: 2,
      cols: 3,
      addBorder: true,
      borderWidth: 2,
    },
  },
};

export const Landscape: Story = {
  args: {
    parameters: {
      ...defaultParameters,
      orientation: "LANDSCAPE",
      pagesPerSheet: 2,
    },
  },
};
