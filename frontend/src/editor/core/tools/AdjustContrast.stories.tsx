import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";

const meta = {
  title: "Tools/Adjust Colors & Contrast/Panel",
  ...toolPanelMeta("adjustContrast"),
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Panel: Story = {};

export const AdjustedColors: Story = {
  args: {
    parameters: {
      contrast: 140,
      brightness: 85,
      saturation: 60,
      red: 120,
      green: 100,
      blue: 70,
    },
  },
};

export const SeveralFiles: Story = {
  args: { files: ["sample.pdf", "multi-page-sample.pdf"] },
};
