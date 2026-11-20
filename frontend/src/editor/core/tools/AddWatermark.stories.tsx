import type { StoryObj } from "@storybook/react-vite";
import { toolPanelMeta } from "@editor/components/tools/toolPanelStory/toolPanelMeta";
import { openTooltip } from "@editor/components/tools/toolPanelStory/toolPanelStoryPlay";

const meta = {
  title: "Tools/Add Watermark/Panel",
  ...toolPanelMeta("watermark"),
};
export default meta;

type Story = StoryObj<typeof meta>;

const textWatermark = { parameters: { watermarkType: "text" } } as const;

const imageWatermark = { parameters: { watermarkType: "image" } } as const;

export const Panel: Story = {};

export const TextWatermark: Story = {
  args: textWatermark,
};

export const ImageWatermark: Story = {
  args: imageWatermark,
};

export const ImageWatermarkChosen: Story = {
  args: { ...imageWatermark, parameterFiles: { watermarkImage: "sample.png" } },
};

export const WatermarkTypeTooltip: Story = {
  play: openTooltip({ step: "Watermark Type" }),
};

export const WordingTooltip: Story = {
  args: textWatermark,
  play: openTooltip({ step: "Wording" }),
};

export const StyleTooltip: Story = {
  args: textWatermark,
  play: openTooltip({ step: "Style" }),
};

export const FormattingTooltip: Story = {
  args: textWatermark,
  play: openTooltip({ step: "Formatting" }),
};

export const WatermarkFileTooltip: Story = {
  args: imageWatermark,
  play: openTooltip({ step: "Watermark File" }),
};

export const SettingsRequiredTooltip: Story = {
  play: openTooltip({ runButton: true }),
};
